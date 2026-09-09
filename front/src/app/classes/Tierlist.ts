import { SupportCard } from "./SupportCard";
import { DeckEvaluator } from "./DeckEvaluator";
import {
    CardData,
    RaceTypes,
    RunningTypes,
    StatsDict,
    HintResult,
    TrainingMode,
    TrainingFocusPreset,
} from "../types/cardTypes";
import { ACTIVE_PENALTY_CONFIG, PenaltyConfig } from "../config/penaltyConfig";
import { TrainingData } from "../config/trainingData";
import { WEIGHTS_CONFIG } from "../config/weightsConfig";

interface TierlistCard {
    id: number;
    chara_id: number;
    card_name: string;
    card_rarity: string;
    limit_break: number;
    card_type: string;
    hints: HintResult;
}

interface TierlistDeck {
    cards: TierlistCard[];
    score: number;
    stats: StatsDict;
    // Career per-stat variance over training turns (sum of independent per-turn
    // combinatorial variances). Absent for decks computed before this field
    // existed or when the variance estimator was unavailable.
    statsVariance?: StatsDict;
    hints?: HintResult;
    scoreBreakdown?: {
        totalScore: number;
        baseScore: number;
        staminaPenalty: number;
        staminaPenaltyReason: string;
        speedPenalty: number;
        speedPenaltyReason: string;
        raceBonusPenalty: number;
        raceBonusPenaltyReason: string;
        usefulHintsPenalty: number;
        usefulHintsPenaltyReason: string;
        statOverbuiltPenalty: number;
        statOverbuiltPenaltyReason: string;
        statContributions: Array<{
            stat: string;
            value: number;
            weight: number;
            contribution: number;
        }>;
        activeRaceTypes: string[];
        staminaThreshold: number;
        speedThreshold: number;
    };
}

export interface TierlistEntry {
    id: number;
    chara_id: number;
    card_name: string;
    card_rarity: string;
    limit_break: number;
    card_type: string;
    support_effects: Record<SupportEffectName, number>;
    hints: HintResult;
    hintTypes: string[];
    stats: StatsDict;
    stats_diff_only_added_to_deck: StatsDict;
    score: number;
}

export const SUPPORT_EFFECT_NAMES = [
    "Friendship Bonus",
    "Mood Effect",
    "Speed Bonus",
    "Stamina Bonus",
    "Power Bonus",
    "Guts Bonus",
    "Wit Bonus",
    "Training Effectiveness",
    "Initial Speed",
    "Initial Stamina",
    "Initial Power",
    "Initial Guts",
    "Initial Wit",
    "Initial Friendship Gauge",
    "Race Bonus",
    "Fan Bonus",
    "Hint Levels",
    "Hint Frequency",
    "Specialty Priority",
    "Max Speed",
    "Max Stamina",
    "Max Power",
    "Max Guts",
    "Max Wit",
    "Event Recovery",
    "Event Effectiveness",
    "Failure Protection",
    "Energy Cost Reduction",
    "Minigame Effectiveness",
    "Skill Point Bonus",
    "Wit Friendship Recovery",
] as const;

export type SupportEffectName = typeof SUPPORT_EFFECT_NAMES[number];

export interface TierlistSuccess {
    tierlist: Record<string, TierlistEntry[]>;
    deck: TierlistDeck;
    inputDeck: {
        cardCount: number;
        raceTypes: RaceTypes;
        runningTypes: RunningTypes;
    };
}

export interface TierlistError {
    success: false;
    error: string;
}

export type TierlistResponse = TierlistSuccess | TierlistError;
export interface LimitBreakFilter {
    R: number[]; // Which limit breaks to include for R cards (0-4)
    SR: number[]; // Which limit breaks to include for SR cards (0-4)
    SSR: number[]; // Which limit breaks to include for SSR cards (0-4)
}

export class Tierlist {
    private static readonly rarityToSymbol: Record<number, string> = {
        1: "R",
        2: "SR",
        3: "SSR",
    };

    /**
     * Calculates stability, energy, initial stats, and race bonuses for cards in Independent Training (Auto/AFK) mode.
     */
    public calculateAutoCardBonuses(
        card: SupportCard,
        deckHasPal: boolean = false,
    ): {
        palBonus: number;
        initialStatsBonus: number;
        passiveEventsBonus: number;
        raceBonusScore: number;
        totalAutoBonus: number;
    } {
        // 1. Pal / Friend Card stability bonus
        // In Independent Training (Auto/AFK), Pal cards stabilize energy, offer failure protection,
        // provide high flat energy recovery and prevent injury death spirals.
        let palBonus = 0;
        const isPal = card.cardType.type === "Support" || card.cardType.type === "Buddy";
        const hasFlatReduction = (card.cardBonus["Flat Energy Cost Reduction (Friendship Training)"] || 0) > 0;
        const energyCostReduction = card.cardBonus["Energy Cost Reduction"] !== -1 ? (card.cardBonus["Energy Cost Reduction"] || 0) : 0;
        const failureProtection = card.cardBonus["Failure Protection"] !== -1 ? (card.cardBonus["Failure Protection"] || 0) : 0;

        if (isPal || hasFlatReduction) {
            // First Pal card in the deck is a crucial lifeline (+120), secondary Pal still provides moderate stability (+40)
            palBonus += deckHasPal ? 40 : 120;
        }
        if (energyCostReduction > 0) {
            palBonus += energyCostReduction * 4;
        }
        if (failureProtection > 0) {
            palBonus += failureProtection * 3;
        }

        // 2. Initial Stats stability bonus (Guaranteed turn 1 stats without RNG)
        const initSpd = card.cardBonus["Initial Speed"] !== -1 ? (card.cardBonus["Initial Speed"] || 0) : 0;
        const initSta = card.cardBonus["Initial Stamina"] !== -1 ? (card.cardBonus["Initial Stamina"] || 0) : 0;
        const initPow = card.cardBonus["Initial Power"] !== -1 ? (card.cardBonus["Initial Power"] || 0) : 0;
        const initGut = card.cardBonus["Initial Guts"] !== -1 ? (card.cardBonus["Initial Guts"] || 0) : 0;
        const initWit = card.cardBonus["Initial Wit"] !== -1 ? (card.cardBonus["Initial Wit"] || 0) : 0;
        const totalInit = initSpd + initSta + initPow + initGut + initWit;
        const initialStatsBonus = totalInit * 1.5;

        // 3. Passive Events and Event Recovery
        const evRec = card.cardBonus["Event Recovery"] !== -1 ? (card.cardBonus["Event Recovery"] || 0) : 0;
        const evEff = card.cardBonus["Event Effectiveness"] !== -1 ? (card.cardBonus["Event Effectiveness"] || 0) : 0;
        const passiveEventsBonus = (evRec * 2.5) + (evEff * 1.5);

        // 4. Race Bonus (Direct bonus for consistent race stat/SP yields in auto runs)
        const rBonus = card.cardBonus["Race Bonus"] !== -1 ? (card.cardBonus["Race Bonus"] || 0) : 0;
        const raceBonusScore = rBonus * 3.5;

        const totalAutoBonus = palBonus + initialStatsBonus + passiveEventsBonus + raceBonusScore;

        return {
            palBonus,
            initialStatsBonus,
            passiveEventsBonus,
            raceBonusScore,
            totalAutoBonus,
        };
    }

    public bestCardForDeck(
        deckObject: DeckEvaluator = new DeckEvaluator(),
        raceTypes?: RaceTypes,
        runningTypes?: RunningTypes,
        allData: CardData[] = [],
        filter?: LimitBreakFilter,
        scenarioName: string = "URA",
        optionalRaces: {G1: number, G2or3: number, PreOPorOP: number} = {G1: 0, G2or3: 0, PreOPorOP: 0},
        averageMood: number = 15,
        sparkCapBonus: Record<string, number> = {},
        trainingMode: TrainingMode = "manual",
        trainingFocus: TrainingFocusPreset = "Balanced",
    ): TierlistResponse {
        // Default race types
        if (!raceTypes) {
            raceTypes = {
                Sprint: false,
                Mile: false,
                Medium: true,
                Long: false,
            };
        }

        // Default running types
        if (!runningTypes) {
            runningTypes = {
                "Front Runner": false,
                "Pace Chaser": true,
                "Late Surger": false,
                "End Closer": false,
            };
        }

        if (!filter) {
            filter = {
                R: [0, 4],
                SR: [0, 4],
                SSR: [0, 4],
            };
        }

        const weights = this.calculateWeights(raceTypes, trainingMode, trainingFocus);

        // Create a deep copy of the deck
        const originalDeck = this.deepCopyDeck(deckObject);
        const baseResultForDeck = deckObject.evaluateStats(scenarioName, averageMood, optionalRaces, true, trainingMode, trainingFocus);
        // Career per-stat variance for the populated deck (cards driving the
        // combinatorial PMF). Empty-deck path contributes 0, so this also
        // acts as the variance of the displayed total = base + delta.
        const baseVarianceForDeck = deckObject.getVariance();
        
        const emptyDeckEvaluator = new DeckEvaluator();
        if (deckObject.manualDistribution) {
            emptyDeckEvaluator.setManualDistribution(deckObject.manualDistribution);
        }
        const baseResultEmptyDeck = emptyDeckEvaluator.evaluateStats(scenarioName, averageMood, {G1: 0, G2or3: 0, PreOPorOP: 0}, false, trainingMode, trainingFocus);

        const raceTypesArray = [
            raceTypes.Sprint,
            raceTypes.Mile,
            raceTypes.Medium,
            raceTypes.Long,
        ];

        const runningTypesArray = [
            runningTypes["Front Runner"],
            runningTypes["Pace Chaser"],
            runningTypes["Late Surger"],
            runningTypes["End Closer"],
        ];

        const deck: TierlistDeck = {
            cards: [],
            score: 0,
            stats: {
                Speed: 0,
                Stamina: 0,
                Power: 0,
                Guts: 0,
            },
            scoreBreakdown: {
                totalScore: 0,
                baseScore: 0,
                staminaPenalty: 0,
                staminaPenaltyReason: "",
                speedPenalty: 0,
                speedPenaltyReason: "",
                raceBonusPenalty: 0,
                raceBonusPenaltyReason: "",
                usefulHintsPenalty: 0,
                usefulHintsPenaltyReason: "",
                statOverbuiltPenalty: 0,
                statOverbuiltPenaltyReason: "",
                statContributions: [],
                activeRaceTypes: [],
                staminaThreshold: 0,
                speedThreshold: 0,
            },
        };

        let hintsForDeck: HintResult = {
            hint_frequency: 0,
            hints_from_events: 0,
            useful_hints_rate: 0,
            "hints from training": 0,
            total_hints: 0,
            gold_skills: [],
        };

        for (const card of originalDeck.deck) {
            if (card) {
                const hintForCard = card.evaluateCardHints(
                    raceTypesArray,
                    runningTypesArray,
                    optionalRaces,
                    {
                        Speed: baseResultForDeck.Speed || 0,
                        Stamina: baseResultForDeck.Stamina || 0,
                        Power: baseResultForDeck.Power || 0,
                        Guts: baseResultForDeck.Guts || 0,
                        Wit: baseResultForDeck.Wit || 0,
                    },
                    {
                        Speed: weights.Speed || 0,
                        Stamina: weights.Stamina || 0,
                        Power: weights.Power || 0,
                        Guts: weights.Guts || 0,
                        Wit: weights.Wit || 0,
                    }
                );
                deck.cards.push({
                    id: card.id,
                    chara_id: card.cardUma.id,
                    card_name: card.cardUma.name,
                    card_rarity:
                        Tierlist.rarityToSymbol[card.rarity] || "Unknown",
                    limit_break: card.limitBreak,
                    card_type: card.cardType.type,
                    hints: hintForCard,
                });
            }

            // This matches the Python bug where these lines are inside the loop
            hintsForDeck = deckObject.evaluateHints(
                raceTypesArray, 
                runningTypesArray, 
                optionalRaces,
                {
                    Speed: baseResultForDeck.Speed || 0,
                    Stamina: baseResultForDeck.Stamina || 0,
                    Power: baseResultForDeck.Power || 0,
                    Guts: baseResultForDeck.Guts || 0,
                    Wit: baseResultForDeck.Wit || 0,
                },
                {
                    Speed: weights.Speed || 0,
                    Stamina: weights.Stamina || 0,
                    Power: weights.Power || 0,
                    Guts: weights.Guts || 0,
                    Wit: weights.Wit || 0,
                }
            );
        }

        // Calculate deck stats delta
        deck.stats = this.calculateStatsDelta(baseResultForDeck, baseResultEmptyDeck);
        deck.statsVariance = baseVarianceForDeck ?? undefined;
        deck.hints = hintsForDeck;

        // Calculate deck score using delta stats (consistent with individual card scoring)
        deck.score = this.resultsWithPenaltyToScore(
            baseResultForDeck,
            deck.stats,
            hintsForDeck,
            weights,
            raceTypes,
            ACTIVE_PENALTY_CONFIG,
            scenarioName,
            sparkCapBonus,
            trainingMode,
        );

        const deckHasPal = originalDeck.deck.some(
            (c) => c && (c.cardType.type === "Support" || c.cardType.type === "Buddy" || (c.cardBonus["Flat Energy Cost Reduction (Friendship Training)"] || 0) > 0)
        );

        if (trainingMode === "independent") {
            let totalDeckAutoBonus = 0;
            let palCount = 0;
            for (const c of originalDeck.deck) {
                if (!c) continue;
                const bonuses = this.calculateAutoCardBonuses(c, palCount > 0);
                totalDeckAutoBonus += bonuses.totalAutoBonus;
                if (c.cardType.type === "Support" || c.cardType.type === "Buddy" || (c.cardBonus["Flat Energy Cost Reduction (Friendship Training)"] || 0) > 0) {
                    palCount++;
                }
            }
            deck.score = (deck.score * 0.65) + totalDeckAutoBonus;
        }

        // Generate score breakdown for the deck using the delta stats
        deck.scoreBreakdown = this.getScoreBreakdown(
            baseResultForDeck,
            deck.stats,
            hintsForDeck,
            weights,
            raceTypes,
            ACTIVE_PENALTY_CONFIG,
            scenarioName,
            sparkCapBonus,
            trainingMode,
            originalDeck.deck,
        );

        const results: TierlistEntry[] = [];

        // Iterate through all cards in data
        for (const cardEntry of allData) {
            const cardId = cardEntry.id;
            if (!cardId) continue;

            const charaId = cardEntry.chara_id_card || -1;
            const cardName = cardEntry.card_chara_name || "Unknown";
            const cardRarity =
                Tierlist.rarityToSymbol[cardEntry.rarity || -1] || "Unknown";
            let cardType = cardEntry.prefered_type || "Unknown";
            cardType = cardType === "Intelligence" ? "Wit" : cardType;

            // Get the allowed limit breaks for this rarity
            const allowedLimitBreaks =
                filter[cardRarity as keyof LimitBreakFilter] || [];

            for (let limitBreak = 0; limitBreak < 5; limitBreak++) {
                // Skip this limit break if it's not in the filter
                if (!allowedLimitBreaks.includes(limitBreak)) {
                    continue;
                }
                try {
                    const card = new SupportCard(cardId, limitBreak, allData);
                    const tempDeck = deckObject
                        ? this.deepCopyDeck(deckObject)
                        : new DeckEvaluator();
                    tempDeck.addCard(card);

                    const result = tempDeck.evaluateStats(scenarioName, averageMood, optionalRaces, false, trainingMode, trainingFocus);
                    const cardHints = card.evaluateCardHints(
                        raceTypesArray,
                        runningTypesArray,
                        optionalRaces,
                        {
                            Speed: result.Speed || 0,
                            Stamina: result.Stamina || 0,
                            Power: result.Power || 0,
                            Guts: result.Guts || 0,
                            Wit: result.Wit || 0,
                        },
                        {
                            Speed: weights.Speed || 0,
                            Stamina: weights.Stamina || 0,
                            Power: weights.Power || 0,
                            Guts: weights.Guts || 0,
                            Wit: weights.Wit || 0,
                        }
                    );
                    const deckHints = tempDeck.evaluateHints(
                        raceTypesArray,
                        runningTypesArray,
                        optionalRaces,
                        {
                            Speed: result.Speed || 0,
                            Stamina: result.Stamina || 0,
                            Power: result.Power || 0,
                            Guts: result.Guts || 0,
                            Wit: result.Wit || 0,
                        },
                        {
                            Speed: weights.Speed || 0,
                            Stamina: weights.Stamina || 0,
                            Power: weights.Power || 0,
                            Guts: weights.Guts || 0,
                            Wit: weights.Wit || 0,
                        }
                    );

                    // Calculate delta from empty deck (consistent with deck.score calculation)
                    const deltaStat = this.calculateStatsDelta(result, baseResultEmptyDeck);
                    const deltaCardStat = this.calculateStatsDelta(result, baseResultForDeck);
                    // Calculate what the new deck's total score would be with this card added
                    const newDeckScore = this.resultsWithPenaltyToScore(
                        result, // total stats of deck + this card
                        deltaStat, // delta from empty deck (consistent with deck.score)
                        deckHints, // hints of deck + this card
                        weights,
                        raceTypes,
                        ACTIVE_PENALTY_CONFIG,
                        scenarioName,
                        sparkCapBonus,
                        trainingMode,
                    );

                    // The card's actual impact is the difference between new deck score and current deck score
                    const currentDeckScore = deck.score;
                    let cardImpact = newDeckScore - currentDeckScore;

                    if (trainingMode === "independent") {
                        // Obniż wagę kart opierających się wyłącznie na wysokim Training Performance / Friendship Bonus
                        // Algorytm gry nie poluje na podwójne/potrójne rainbow trainingi, więc sufit treningowy ma niższe przełożenie
                        cardImpact *= 0.65;

                        // Zwiększ priorytet kart Pal/Friend, Initial Stats, Eventów pasywnych i Race Bonus
                        const autoBonuses = this.calculateAutoCardBonuses(card, deckHasPal);
                        cardImpact += autoBonuses.totalAutoBonus;
                    }



                    // Extract hint types for this card
                    const cardInstance = new SupportCard(cardId, limitBreak, allData);
                    const hintTypes = cardInstance.extractHintTypes();
                    const supportEffects = SUPPORT_EFFECT_NAMES.reduce(
                        (acc, effectName) => {
                            acc[effectName] = Math.max(
                                cardInstance.cardBonus[effectName] || 0,
                                0,
                            );
                            return acc;
                        },
                        {} as Record<SupportEffectName, number>,
                    );

                    results.push({
                        id: cardId,
                        chara_id: charaId,
                        card_name: cardName,
                        card_rarity: cardRarity,
                        limit_break: limitBreak,
                        card_type: cardType,
                        support_effects: supportEffects,
                        hints: cardHints,
                        hintTypes: hintTypes,
                        stats: deltaStat,
                        stats_diff_only_added_to_deck: deltaCardStat,
                        score: cardImpact,
                    });
                } catch (error) {
                    // Skip cards that can't be instantiated
                    console.warn(
                        `Failed to create card ${cardId} at ${limitBreak}lb:`,
                        error,
                    );
                    continue;
                }
            }
        }

        // Group and sort results by card_type
        const grouped: Record<string, TierlistEntry[]> = {};
        for (const entry of results) {
            if (!grouped[entry.card_type]) {
                grouped[entry.card_type] = [];
            }
            grouped[entry.card_type].push(entry);
        }

        const response: Record<string, TierlistEntry[]> = {};
        for (const [cardType, entries] of Object.entries(grouped)) {
            response[cardType] = entries.sort((a, b) => b.score - a.score);
        }

        return {
            tierlist: response,
            deck: deck,
            inputDeck: {
                cardCount: originalDeck.deck.length,
                raceTypes: raceTypes,
                runningTypes: runningTypes,
            },
        };
    }

    /**
     * Evaluates a specific list of cards at their exact specified limit break levels.
     * Essential for evaluating a player's actual owned card inventory.
     */
    public evaluateSpecificCards(
        deckEvaluator: DeckEvaluator,
        raceTypes: RaceTypes,
        runningTypes: RunningTypes,
        cardsToEvaluate: Array<{ id: number; limitBreak: number }>,
        allData: CardData[],
        scenarioName: string = "GrandConcert",
        optionalRaces: { G1: number; G2or3: number; PreOPorOP: number } = { G1: 0, G2or3: 0, PreOPorOP: 0 },
        averageMood: number = 15,
        sparkCapBonus: Record<string, number> = {},
        trainingMode: TrainingMode = "manual",
        trainingFocus: TrainingFocusPreset = "Balanced",
    ): TierlistEntry[] {
        const raceTypesArray = [
            raceTypes.Sprint,
            raceTypes.Mile,
            raceTypes.Medium,
            raceTypes.Long,
        ];

        const runningTypesArray = [
            runningTypes["Front Runner"],
            runningTypes["Pace Chaser"],
            runningTypes["Late Surger"],
            runningTypes["End Closer"],
        ];

        const deckObject = deckEvaluator ? this.deepCopyDeck(deckEvaluator) : new DeckEvaluator();
        const baseResultForDeck = deckObject.evaluateStats(
            scenarioName,
            averageMood,
            optionalRaces,
            false,
            trainingMode,
            trainingFocus,
        );
        const baseResultEmptyDeck = new DeckEvaluator().evaluateStats(
            scenarioName,
            averageMood,
            optionalRaces,
            false,
            trainingMode,
            trainingFocus,
        );

        const weights = this.calculateWeights(raceTypes, trainingMode, trainingFocus);

        const hintsForDeck = deckObject.evaluateHints(
            raceTypesArray,
            runningTypesArray,
            optionalRaces,
            {
                Speed: baseResultForDeck.Speed || 0,
                Stamina: baseResultForDeck.Stamina || 0,
                Power: baseResultForDeck.Power || 0,
                Guts: baseResultForDeck.Guts || 0,
                Wit: baseResultForDeck.Wit || 0,
            },
            {
                Speed: weights.Speed || 0,
                Stamina: weights.Stamina || 0,
                Power: weights.Power || 0,
                Guts: weights.Guts || 0,
                Wit: weights.Wit || 0,
            }
        );

        let currentDeckScore = this.resultsWithPenaltyToScore(
            baseResultForDeck,
            this.calculateStatsDelta(baseResultForDeck, baseResultEmptyDeck),
            hintsForDeck,
            weights,
            raceTypes,
            ACTIVE_PENALTY_CONFIG,
            scenarioName,
            sparkCapBonus,
            trainingMode,
        );

        const deckHasPal = deckObject.deck.some(
            (c) => c && (c.cardType.type === "Support" || c.cardType.type === "Buddy" || (c.cardBonus["Flat Energy Cost Reduction (Friendship Training)"] || 0) > 0)
        );

        if (trainingMode === "independent") {
            let totalDeckAutoBonus = 0;
            let palCount = 0;
            for (const c of deckObject.deck) {
                if (!c) continue;
                const bonuses = this.calculateAutoCardBonuses(c, palCount > 0);
                totalDeckAutoBonus += bonuses.totalAutoBonus;
                if (c.cardType.type === "Support" || c.cardType.type === "Buddy" || (c.cardBonus["Flat Energy Cost Reduction (Friendship Training)"] || 0) > 0) {
                    palCount++;
                }
            }
            currentDeckScore = (currentDeckScore * 0.65) + totalDeckAutoBonus;
        }

        const results: TierlistEntry[] = [];
        const cardMap = new Map<number, CardData>();
        for (const c of allData) {
            if (c && c.id) cardMap.set(c.id, c);
        }

        for (const item of cardsToEvaluate) {
            const cardDataEntry = cardMap.get(item.id);
            if (!cardDataEntry) continue;

            const cardId = item.id;
            const limitBreak = Math.max(0, Math.min(4, item.limitBreak));
            const charaId = cardDataEntry.chara_id_card || -1;
            const cardName = cardDataEntry.card_chara_name || "Unknown";
            const cardRarity = Tierlist.rarityToSymbol[cardDataEntry.rarity || -1] || "Unknown";
            let cardType = cardDataEntry.prefered_type || "Unknown";
            cardType = cardType === "Intelligence" ? "Wit" : cardType;

            try {
                const card = new SupportCard(cardId, limitBreak, allData);
                const tempDeck = this.deepCopyDeck(deckObject);
                tempDeck.addCard(card);

                const result = tempDeck.evaluateStats(scenarioName, averageMood, optionalRaces, false, trainingMode, trainingFocus);
                const cardHints = card.evaluateCardHints(
                    raceTypesArray,
                    runningTypesArray,
                    optionalRaces,
                    {
                        Speed: result.Speed || 0,
                        Stamina: result.Stamina || 0,
                        Power: result.Power || 0,
                        Guts: result.Guts || 0,
                        Wit: result.Wit || 0,
                    },
                    {
                        Speed: weights.Speed || 0,
                        Stamina: weights.Stamina || 0,
                        Power: weights.Power || 0,
                        Guts: weights.Guts || 0,
                        Wit: weights.Wit || 0,
                    }
                );

                const deckHints = tempDeck.evaluateHints(
                    raceTypesArray,
                    runningTypesArray,
                    optionalRaces,
                    {
                        Speed: result.Speed || 0,
                        Stamina: result.Stamina || 0,
                        Power: result.Power || 0,
                        Guts: result.Guts || 0,
                        Wit: result.Wit || 0,
                    },
                    {
                        Speed: weights.Speed || 0,
                        Stamina: weights.Stamina || 0,
                        Power: weights.Power || 0,
                        Guts: weights.Guts || 0,
                        Wit: weights.Wit || 0,
                    }
                );

                const deltaStat = this.calculateStatsDelta(result, baseResultEmptyDeck);
                const deltaCardStat = this.calculateStatsDelta(result, baseResultForDeck);

                const newDeckScore = this.resultsWithPenaltyToScore(
                    result,
                    deltaStat,
                    deckHints,
                    weights,
                    raceTypes,
                    ACTIVE_PENALTY_CONFIG,
                    scenarioName,
                    sparkCapBonus,
                    trainingMode,
                );

                let cardImpact = newDeckScore - currentDeckScore;

                if (trainingMode === "independent") {
                    cardImpact *= 0.65;
                    const autoBonuses = this.calculateAutoCardBonuses(card, deckHasPal);
                    cardImpact += autoBonuses.totalAutoBonus;
                }

                const hintTypes = card.extractHintTypes();
                const supportEffects = SUPPORT_EFFECT_NAMES.reduce(
                    (acc, effectName) => {
                        acc[effectName] = Math.max(
                            card.cardBonus[effectName] || 0,
                            0,
                        );
                        return acc;
                    },
                    {} as Record<SupportEffectName, number>,
                );

                results.push({
                    id: cardId,
                    chara_id: charaId,
                    card_name: cardName,
                    card_rarity: cardRarity,
                    limit_break: limitBreak,
                    card_type: cardType,
                    support_effects: supportEffects,
                    hints: cardHints,
                    hintTypes: hintTypes,
                    stats: deltaStat,
                    stats_diff_only_added_to_deck: deltaCardStat,
                    score: cardImpact,
                });
            } catch (err) {
                console.warn(`Failed to evaluate specific card ${cardId} at ${limitBreak}lb:`, err);
            }
        }

        return results.sort((a, b) => b.score - a.score);
    }

    private calculateWeights(
        raceTypes: RaceTypes,
        trainingMode: TrainingMode = "manual",
        trainingFocus: TrainingFocusPreset = "Balanced",
    ): Record<string, number> {
        let weights: Record<string, number> = {};
        const allWeights = WEIGHTS_CONFIG;

        const selectedRaceTypes: string[] = [];
        for (const key of ["Long", "Medium", "Mile", "Sprint"] as const) {
            if (raceTypes[key as keyof RaceTypes]) {
                selectedRaceTypes.push(key);
            }
        }

        if (selectedRaceTypes.length > 0) {
            weights = {
                Speed: 0,
                Stamina: 0,
                Power: 0,
                Guts: 0,
                Wit: 0,
                "Skill Points": 0,
                Hints: 0,
            };

            for (const raceType of selectedRaceTypes) {
                const raceWeights = allWeights[raceType as keyof typeof allWeights];
                for (const [stat, weight] of Object.entries(raceWeights)) {
                    weights[stat] = (weights[stat] || 0) + (weight as number);
                }
            }

            for (const stat in weights) {
                weights[stat] = weights[stat] / selectedRaceTypes.length;
            }
        }

        if (trainingMode === "independent") {
            if (trainingFocus === "Stamina") {
                weights.Stamina = Math.max((weights.Stamina || 1.0) * 1.35, 1.3);
                weights.Power = (weights.Power || 1.0) * 1.15;
            } else if (trainingFocus === "Sprint") {
                weights.Speed = Math.max((weights.Speed || 1.0) * 1.35, 1.4);
                weights.Power = Math.max((weights.Power || 1.0) * 1.2, 1.2);
                weights.Stamina = (weights.Stamina || 1.0) * 0.4;
            }
        }

        return weights;
    }

    private resultsToScore(
        resultDict: StatsDict,
        hintDict: HintResult,
        weights: Record<string, number>,
        trainingMode: TrainingMode = "manual",
    ): number {
        // TODO: Add more sophisticated scoring // use hint_dict
        if (!weights || Object.keys(weights).length === 0) {
            weights = {
                Speed: 1.0,
                Stamina: 1.0,
                Power: 1.0,
                Guts: 1.0,
                Wit: 1.0,
                "Skill Points": 0.2,
                Hints: 4.0,
            };
        }

        const weightsCopy = { ...weights };

        let score = 0;
        // Score regular stats
        for (const [k, v] of Object.entries(resultDict)) {
            const weight = weightsCopy[k] || 0;
            score += v * weight;
        }

        // Add hints contribution using direct weight, multiplied by useful hints rate
        // In Independent Training, boost hints and gold skills (+50%) for Priority Skills & parent farming
        const totalHints = hintDict.total_hints || 0;
        const usefulHintsRate = hintDict.useful_hints_rate || 0;
        const hintsWeight = (weightsCopy["Hints"] || 4.0) * (trainingMode === "independent" ? 1.5 : 1.0);
        score += totalHints * usefulHintsRate * hintsWeight;

        // Add gold skills contribution
        const goldSkills = hintDict.gold_skills || [];
        const goldSkillWeight = (weightsCopy["Gold Skills"] || 1.0) * (trainingMode === "independent" ? 1.5 : 1.0);
        for (const goldSkill of goldSkills) {
            score += goldSkill.value * goldSkill.multiplier * goldSkillWeight;
        }

        return score;
    }

    private resultsWithPenaltyToScore(
        rawStats: StatsDict,
        deltaStats: StatsDict,
        hintDict: HintResult,
        weights: Record<string, number>,
        raceTypes?: RaceTypes,
        penaltyConfig: PenaltyConfig = ACTIVE_PENALTY_CONFIG,
        scenarioName: string = "URA",
        sparkCapBonus: Record<string, number> = {},
        trainingMode: TrainingMode = "manual",
    ): number {
        // Apply the soft-cap rules to stats before calculating score.
        // Gains above 1200 are halved; gains above the scenario max are clamped.
        const maxStats = TrainingData.getMaxStats(scenarioName);

        const clampedRawStats = { ...rawStats };
        const clampedDeltaStats = { ...deltaStats };

        // Apply soft cap
        for (const stat of ["Speed", "Stamina", "Power", "Guts", "Wit"] as const) {
            const statKey = stat === "Wit" ? "Intelligence" : stat;
            const maxVal = (maxStats[statKey] || 1200) + (sparkCapBonus[statKey] || 0);
            const currentVal = rawStats[stat] || 0;

            if (currentVal > TrainingData.SOFT_STAT_CAP) {
                const effectiveVal = TrainingData.getEffectiveStat(currentVal, maxVal);
                clampedRawStats[stat] = effectiveVal;
                // Adjust delta: newDelta = effectiveTotal - base
                // base = currentTotal - currentDelta
                const baseVal = currentVal - (deltaStats[stat] || 0);
                clampedDeltaStats[stat] = effectiveVal - baseVal;
            }
        }

        // Get base score from clamped delta stats
        const baseScore = this.resultsToScore(clampedDeltaStats, hintDict, weights, trainingMode);

        // Calculate stamina penalty based on raw stats (using original raw stats for penalties?)
        // User said "1310 speed would be rounded down to 1200 when calculated"
        // But penalties usually apply to meeting thresholds.
        // If I have 1310 speed, I definitely meet the 1200 threshold.
        // So using rawStats for threshold checks is correct.

        let staminaPenaltyPercent = 0; // Penalty as percentage (0.2 = 20%)
        let speedPenaltyPercent = 0; // Penalty as percentage

        if (raceTypes) {
            const stamina = rawStats.Stamina || 0;
            const speed = rawStats.Speed || 0;

            // Determine the active race types
            const activeRaceTypes = Object.entries(raceTypes)
                .filter(([_, isActive]) => isActive)
                .map(([raceType, _]) => raceType);

            if (activeRaceTypes.length > 0) {
                // Use stamina thresholds from config
                const staminaThresholds = penaltyConfig.stamina.thresholds;
                const speedThresholds = penaltyConfig.speed.thresholds;

                // Use the highest threshold among active race types (most demanding)
                const maxStaminaThreshold = Math.max(
                    ...activeRaceTypes.map(
                        (raceType) => staminaThresholds[raceType] || 400,
                    ),
                );

                const maxSpeedThreshold = Math.max(
                    ...activeRaceTypes.map(
                        (raceType) => speedThresholds[raceType] || 1200,
                    ),
                );

                if (stamina < maxStaminaThreshold - penaltyConfig.stamina.penalties.buffer) {
                    staminaPenaltyPercent = penaltyConfig.stamina.penalties.major;
                } else if (stamina < maxStaminaThreshold) {
                    staminaPenaltyPercent = penaltyConfig.stamina.penalties.minor;
                }

                if (speed < maxSpeedThreshold - penaltyConfig.speed.penalties.buffer) {
                    speedPenaltyPercent = penaltyConfig.speed.penalties.major;
                } else if (speed < maxSpeedThreshold) {
                    speedPenaltyPercent = penaltyConfig.speed.penalties.minor;
                }
            }
        }

        // Useful hints penalty removed - now using useful hints count directly in score

        // Stat overbuilt penalty removed as requested

        // Trackblazers race bonus penalty
        let raceBonusPenaltyPercent = 0;
        if (scenarioName === "MANT") {
            // Race bonus comes from DeckEvaluator as a raw stat field
            const raceBonus = rawStats["Race Bonus"] || 0;

            // If race bonus is below 50, apply 5% penalty for each 5 below 50 (max 25%)
            if (raceBonus < 50) {
                const deficiency = 50 - raceBonus;
                const penaltyLevels = Math.floor(deficiency / 5);
                raceBonusPenaltyPercent = Math.min(penaltyLevels * 0.05, 0.25);
            }
        }

        // Apply additive penalties (like taxes)
        const totalPenaltyPercent =
            staminaPenaltyPercent + speedPenaltyPercent + raceBonusPenaltyPercent;
        const finalMultiplier = 1.0 - totalPenaltyPercent;

        const finalScore = baseScore * finalMultiplier;

        return finalScore;
    }

    public getScoreBreakdown(
        rawStats: StatsDict,
        deltaStats: StatsDict,
        hintDict: HintResult,
        weights: Record<string, number>,
        raceTypes?: RaceTypes,
        penaltyConfig: PenaltyConfig = ACTIVE_PENALTY_CONFIG,
        scenarioName: string = "URA",
        sparkCapBonus: Record<string, number> = {},
        trainingMode: TrainingMode = "manual",
        deckCards: SupportCard[] = [],
    ): {
        totalScore: number;
        baseScore: number;
        staminaPenalty: number;
        staminaPenaltyReason: string;
        speedPenalty: number;
        speedPenaltyReason: string;
        raceBonusPenalty: number;
        raceBonusPenaltyReason: string;
        usefulHintsPenalty: number;
        usefulHintsPenaltyReason: string;
        statOverbuiltPenalty: number;
        statOverbuiltPenaltyReason: string;
        statContributions: Array<{
            stat: string;
            value: number;
            weight: number;
            contribution: number;
        }>;
        activeRaceTypes: string[];
        staminaThreshold: number;
        speedThreshold: number;
    } {
        // TODO: Add more sophisticated scoring // use hint_dict
        if (!weights || Object.keys(weights).length === 0) {
            weights = {
                Speed: 1.0,
                Stamina: 1.0,
                Power: 1.0,
                Guts: 1.0,
                Wit: 1.0,
                "Skill Points": 0.2,
                Hints: 4.0,
            };
        }

        // Apply the soft-cap rules to stats before calculating score.
        // Gains above 1200 are halved; gains above the scenario max are clamped.
        const maxStats = TrainingData.getMaxStats(scenarioName);

        const clampedDeltaStats = { ...deltaStats };

        // Apply soft cap to delta stats for breakdown
        for (const stat of ["Speed", "Stamina", "Power", "Guts", "Wit"] as const) {
            const statKey = stat === "Wit" ? "Intelligence" : stat;
            const maxVal = (maxStats[statKey] || 1200) + (sparkCapBonus[statKey] || 0);
            const currentVal = rawStats[stat] || 0;

            if (currentVal > TrainingData.SOFT_STAT_CAP) {
                const effectiveVal = TrainingData.getEffectiveStat(currentVal, maxVal);
                // Adjust delta: newDelta = effectiveTotal - base
                // base = currentTotal - currentDelta
                const baseVal = currentVal - (deltaStats[stat] || 0);
                clampedDeltaStats[stat] = effectiveVal - baseVal;
            }
        }

        // Calculate base score using clamped delta stats
        const baseScore = this.resultsToScore(clampedDeltaStats, hintDict, weights, trainingMode);

        // Calculate stat contributions from clamped delta stats
        const statContributions = [];
        const trainingDeltaFactor = trainingMode === "independent" ? 0.65 : 1.0;
        for (const [k, v] of Object.entries(clampedDeltaStats)) {
            const weight = weights[k] || 0;
            const contribution = v * weight * trainingDeltaFactor;
            statContributions.push({
                stat: k,
                value: v,
                weight: weight * trainingDeltaFactor,
                contribution: contribution,
            });
        }

        // Add hints contribution to stat contributions, multiplied by useful hints rate
        const totalHints = hintDict.total_hints || 0;
        const usefulHintsRate = hintDict.useful_hints_rate || 0;
        const usefulHintsCount = Math.round(totalHints * usefulHintsRate);
        const hintsWeight = (weights["Hints"] || 4.0) * (trainingMode === "independent" ? 1.5 : 1.0);
        const hintsContribution = usefulHintsCount * hintsWeight;
        statContributions.push({
            stat: "Useful Hints",
            value: usefulHintsCount,
            weight: hintsWeight,
            contribution: hintsContribution,
        });

        // Add each gold skill as a separate line item
        const goldSkills = hintDict.gold_skills || [];
        const goldSkillWeight = (weights["Gold Skills"] || 1.0) * (trainingMode === "independent" ? 1.5 : 1.0);
        
        for (const goldSkill of goldSkills) {
            const skillContribution = goldSkill.value * goldSkill.multiplier * goldSkillWeight;
            statContributions.push({
                stat: goldSkill.name,
                value: goldSkill.value,
                weight: goldSkill.multiplier * (trainingMode === "independent" ? 1.5 : 1.0),
                contribution: skillContribution,
                icon_id: goldSkill.icon_id,
            });
        }

        let totalDeckAutoBonus = 0;
        if (trainingMode === "independent" && deckCards.length > 0) {
            let totalPalBonus = 0;
            let totalInitBonus = 0;
            let totalEventBonus = 0;
            let totalRaceBonusScore = 0;
            let palSeen = false;
            for (const card of deckCards) {
                if (!card) continue;
                const b = this.calculateAutoCardBonuses(card, palSeen);
                totalPalBonus += b.palBonus;
                totalInitBonus += b.initialStatsBonus;
                totalEventBonus += b.passiveEventsBonus;
                totalRaceBonusScore += b.raceBonusScore;
                totalDeckAutoBonus += b.totalAutoBonus;
                if (card.cardType.type === "Support" || card.cardType.type === "Buddy" || (card.cardBonus["Flat Energy Cost Reduction (Friendship Training)"] || 0) > 0) {
                    palSeen = true;
                }
            }

            if (totalPalBonus > 0) {
                statContributions.push({
                    stat: "Pal / Energy Stability",
                    value: Math.round(totalPalBonus),
                    weight: 1.0,
                    contribution: Math.round(totalPalBonus),
                });
            }
            if (totalInitBonus > 0) {
                statContributions.push({
                    stat: "Initial Stats Guarantee",
                    value: Math.round(totalInitBonus),
                    weight: 1.0,
                    contribution: Math.round(totalInitBonus),
                });
            }
            if (totalRaceBonusScore + totalEventBonus > 0) {
                statContributions.push({
                    stat: "Race Bonus & Passive Events",
                    value: Math.round(totalRaceBonusScore + totalEventBonus),
                    weight: 1.0,
                    contribution: Math.round(totalRaceBonusScore + totalEventBonus),
                });
            }
        }

        // Calculate stamina penalty details using raw stats
        const stamina = rawStats.Stamina || 0;
        let staminaPenalty = 1.0;
        let staminaPenaltyPercent = 0;
        let staminaPenaltyReason = "No penalty applied";
        
        // Calculate speed penalty details using raw stats
        const speed = rawStats.Speed || 0;
        let speedPenalty = 1.0;
        let speedPenaltyPercent = 0;
        let speedPenaltyReason = "No penalty applied";

        let activeRaceTypes: string[] = [];
        let staminaThreshold = 400;
        let speedThreshold = 1200;

        if (raceTypes) {
            activeRaceTypes = Object.entries(raceTypes)
                .filter(([_, isActive]) => isActive)
                .map(([raceType, _]) => raceType);

            if (activeRaceTypes.length > 0) {
                const staminaThresholds = penaltyConfig.stamina.thresholds;
                const speedThresholds = penaltyConfig.speed.thresholds;

                staminaThreshold = Math.max(
                    ...activeRaceTypes.map(
                        (raceType) => staminaThresholds[raceType] || 400,
                    ),
                );

                speedThreshold = Math.max(
                    ...activeRaceTypes.map(
                        (raceType) => speedThresholds[raceType] || 1200,
                    ),
                );

                if (stamina < staminaThreshold - penaltyConfig.stamina.penalties.buffer) {
                    staminaPenaltyPercent = penaltyConfig.stamina.penalties.major;
                    staminaPenalty = 1 - staminaPenaltyPercent;
                    staminaPenaltyReason = `${Math.round(staminaPenaltyPercent * 100)}% penalty: Stamina ${Math.round(stamina)} is significantly below threshold ${staminaThreshold} for ${activeRaceTypes.join(", ")}`;
                } else if (stamina < staminaThreshold) {
                    staminaPenaltyPercent = penaltyConfig.stamina.penalties.minor;
                    staminaPenalty = 1 - staminaPenaltyPercent;
                    staminaPenaltyReason = `${Math.round(staminaPenaltyPercent * 100)}% penalty: Stamina ${Math.round(stamina)} is below threshold ${staminaThreshold} for ${activeRaceTypes.join(", ")}`;
                } else {
                    staminaPenaltyReason = `No penalty: Stamina ${Math.round(stamina)} meets threshold ${staminaThreshold} for ${activeRaceTypes.join(", ")}`;
                }

                if (speed < speedThreshold - penaltyConfig.speed.penalties.buffer) {
                    speedPenaltyPercent = penaltyConfig.speed.penalties.major;
                    speedPenalty = 1 - speedPenaltyPercent;
                    speedPenaltyReason = `${Math.round(speedPenaltyPercent * 100)}% penalty: Speed ${Math.round(speed)} is significantly below threshold ${speedThreshold} for ${activeRaceTypes.join(", ")}`;
                } else if (speed < speedThreshold) {
                    speedPenaltyPercent = penaltyConfig.speed.penalties.minor;
                    speedPenalty = 1 - speedPenaltyPercent;
                    speedPenaltyReason = `${Math.round(speedPenaltyPercent * 100)}% penalty: Speed ${Math.round(speed)} is below threshold ${speedThreshold} for ${activeRaceTypes.join(", ")}`;
                } else {
                    speedPenaltyReason = `No penalty: Speed ${Math.round(speed)} meets threshold ${speedThreshold} for ${activeRaceTypes.join(", ")}`;
                }
            }
        }

        // Useful hints penalty removed - now using useful hints count directly in score
        const usefulHintsPenalty = 1.0;
        const usefulHintsPenaltyPercent = 0;
        const usefulHintsPenaltyReason = `No penalty: Using useful hints count (${Math.round(usefulHintsRate * 100)}% of total hints)`;

        // Stat overbuilt penalty removed
        const statOverbuiltPenalty = 1.0;
        const statOverbuiltPenaltyReason = "No penalty: Overbuilt penalty disabled";
        const statOverbuiltPenaltyPercent = 0;

        // Trackblazers race bonus penalty
        let raceBonusPenaltyPercent = 0;
        let raceBonusPenalty = 1.0;
        let raceBonusPenaltyReason = "No penalty: Not Trackblazers scenario";
        
        if (scenarioName === "MANT") {
            const raceBonus = rawStats["Race Bonus"] || 0;

            if (raceBonus < 50) {
                const deficiency = 50 - raceBonus;
                const penaltyLevels = Math.floor(deficiency / 5);
                raceBonusPenaltyPercent = Math.min(penaltyLevels * 0.05, 0.25);
                raceBonusPenalty = 1.0 - raceBonusPenaltyPercent;
                raceBonusPenaltyReason = `${Math.round(raceBonusPenaltyPercent * 100)}% penalty: Race bonus ${Math.round(raceBonus)} is below 50 (deficiency: ${Math.round(deficiency)})`;
            } else {
                raceBonusPenaltyReason = `No penalty: Race bonus ${Math.round(raceBonus)} meets threshold of 50`;
            }
        }

        // Apply additive penalties (like taxes)
        const totalPenaltyPercent =
            staminaPenaltyPercent + speedPenaltyPercent + statOverbuiltPenaltyPercent + raceBonusPenaltyPercent;
        const finalMultiplier = 1.0 - totalPenaltyPercent;
        const totalScore = trainingMode === "independent"
            ? (baseScore * finalMultiplier * 0.65) + totalDeckAutoBonus
            : baseScore * finalMultiplier;

        return {
            totalScore,
            baseScore,
            staminaPenalty,
            staminaPenaltyReason,
            speedPenalty,
            speedPenaltyReason,
            raceBonusPenalty,
            raceBonusPenaltyReason,
            usefulHintsPenalty,
            usefulHintsPenaltyReason,
            statOverbuiltPenalty,
            statOverbuiltPenaltyReason,
            statContributions: statContributions.sort(
                (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution),
            ),
            activeRaceTypes,
            staminaThreshold,
            speedThreshold,
        };
    }
    private calculateStatsDelta(stats1: StatsDict, stats2: StatsDict): StatsDict {
        const result: StatsDict = {
            Speed: (stats1.Speed || 0) - (stats2.Speed || 0),
            Stamina: (stats1.Stamina || 0) - (stats2.Stamina || 0),
            Power: (stats1.Power || 0) - (stats2.Power || 0),
            Guts: (stats1.Guts || 0) - (stats2.Guts || 0),
        };

        // Handle optional properties - butnp,it and Skill Points since they're commonly used
        if (stats1.Intelligence !== undefined || stats2.Intelligence !== undefined) {
            result.Intelligence = (stats1.Intelligence || 0) - (stats2.Intelligence || 0);
        }
        
        // Always include Wit and Skill Points as they're part of the standard calculations
        result.Wit = (stats1.Wit || 0) - (stats2.Wit || 0);
        result["Skill Points"] = (stats1["Skill Points"] || 0) - (stats2["Skill Points"] || 0);
        
        if (stats1.Energy !== undefined || stats2.Energy !== undefined) {
            result.Energy = (stats1.Energy || 0) - (stats2.Energy || 0);
        }
        if (stats1.Potential !== undefined || stats2.Potential !== undefined) {
            result.Potential = (stats1.Potential || 0) - (stats2.Potential || 0);
        }
        if (stats1.Bond !== undefined || stats2.Bond !== undefined) {
            result.Bond = (stats1.Bond || 0) - (stats2.Bond || 0);
        }
        if (stats1["Skill Hint"] !== undefined || stats2["Skill Hint"] !== undefined) {
            result["Skill Hint"] = (stats1["Skill Hint"] || 0) - (stats2["Skill Hint"] || 0);
        }

        return result;
    }
    private deepCopyDeck(deck: DeckEvaluator): DeckEvaluator {
        const newDeck = new DeckEvaluator();
        // Note: This is a shallow copy of cards. For a true deep copy,
        // you might need to recreate the SupportCard objects as well.
        newDeck.deck = [...deck.deck];
        if (deck.manualDistribution) {
            newDeck.setManualDistribution([...deck.manualDistribution]);
        }
        return newDeck;
    }
}
