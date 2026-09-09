"use client";

import React, { useState, useMemo, useEffect } from "react";

import { TrainingFocusPreset } from "../types/cardTypes";
export type { TrainingFocusPreset };

interface IndependentTrainingGuideProps {
    selectedRaces: string[];
    selectedStyles: string[];
    onAutoFillDeck?: () => void;
    currentDeckCount: number;
    className?: string;
    activePreset?: TrainingFocusPreset;
    onPresetChange?: (preset: TrainingFocusPreset) => void;
}

export default function IndependentTrainingGuide({
    selectedRaces,
    selectedStyles,
    onAutoFillDeck,
    currentDeckCount,
    className = "",
    activePreset: controlledPreset,
    onPresetChange,
}: IndependentTrainingGuideProps) {
    // Determine recommended preset based on selected race distances
    const recommendedPreset: TrainingFocusPreset = useMemo(() => {
        if (selectedRaces.includes("Long") || selectedRaces.includes("Medium")) {
            return "Stamina";
        }
        if (selectedRaces.includes("Sprint") || selectedRaces.includes("Mile")) {
            return "Sprint";
        }
        return "Balanced";
    }, [selectedRaces]);

    const [internalPreset, setInternalPreset] = useState<TrainingFocusPreset>(recommendedPreset);
    const activePreset = controlledPreset ?? internalPreset;

    // Keep active preset in sync when distance selection changes if not explicitly overridden
    useEffect(() => {
        if (!controlledPreset) {
            setInternalPreset(recommendedPreset);
        }
    }, [recommendedPreset, controlledPreset]);

    const handlePresetSelect = (preset: TrainingFocusPreset) => {
        setInternalPreset(preset);
        if (onPresetChange) {
            onPresetChange(preset);
        }
    };

    // Detail explanations for each of the 3 in-game presets
    const getPresetDetails = (preset: TrainingFocusPreset) => {
        switch (preset) {
            case "Stamina":
                return {
                    name: "Stamina",
                    inGameLabel: "Stamina Focus",
                    targetRaces: "Medium & Long (Classic Triple Crown, Tenno Sho Spring, Arima Kinen)",
                    staminaTarget: selectedRaces.includes("Long") ? "850 - 950+" : "650 - 750",
                    primaryStats: "Stamina > Speed > Power",
                    botBehavior: "Forces the in-game auto-bot to heavily prioritize Stamina and Power facilities. Essential for Medium/Long races to prevent mid-race fatigue and late-stretch stamina collapse.",
                    prioritySkillsAdvice: "1-2 Gold Stamina Recovery skills (e.g., Arc Maestro, Gourmand) marked as Priority Skills.",
                };
            case "Sprint":
                return {
                    name: "Sprint",
                    inGameLabel: "Sprint Focus",
                    targetRaces: "Sprint & Mile (Sprinters Stakes, Takamatsunomiya, Yasuda Kinen)",
                    staminaTarget: selectedRaces.includes("Sprint") ? "400 - 450" : "500 - 600",
                    primaryStats: "Speed > Power > Wit",
                    botBehavior: "Directs the in-game auto-bot to heavily bias towards Speed and Power training facilities. Avoids wasting precious turns on unneeded stamina and maximizes top burst acceleration.",
                    prioritySkillsAdvice: "Acceleration skills (e.g., Sprint Turbo, Plan X) and positioning skills marked as Priority Skills.",
                };
            case "Balanced":
            default:
                return {
                    name: "Balanced",
                    inGameLabel: "Balanced Focus",
                    targetRaces: "Hybrid / All-Rounders (e.g. Mile + Medium runners like Oguri Cap, Vodka)",
                    staminaTarget: "550 - 650",
                    primaryStats: "Speed = Stamina = Power = Wit",
                    botBehavior: "Distributes simulated training turns evenly across all 5 facilities without favoring any single stat. Best used when your horse runs multi-bracket goals or has balanced inheritance.",
                    prioritySkillsAdvice: "Universal speed and positioning skills with broad trigger conditions.",
                };
        }
    };

    const activeDetails = getPresetDetails(activePreset);

    return (
        <div
            className={`bg-gradient-to-br from-emerald-50 via-teal-50/40 to-cyan-50/30 dark:from-emerald-950/30 dark:via-teal-950/20 dark:to-cyan-950/10 border-2 border-emerald-300 dark:border-emerald-700/70 rounded-2xl p-6 shadow-md ${className}`}
        >
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-emerald-200 dark:border-emerald-800">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center text-xl shadow-md shadow-emerald-500/30">
                        ⚡
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                Independent Training (Auto/AFK) Advisor
                            </h3>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                                Stability &gt; Ceiling
                            </span>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500 text-white shadow-xs">
                                1x Borrowed MLB + 5x Owned
                            </span>
                        </div>
                        <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-1">
                            Optimized for in-game background simulation (自主トレ) and factor/parent farming (因子周回)
                        </p>
                    </div>
                </div>

                {onAutoFillDeck && (
                    <button
                        type="button"
                        onClick={onAutoFillDeck}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl shadow-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
                    >
                        <span>✨</span>
                        <span>Auto-Fill Deck for AFK {currentDeckCount > 0 ? `(${currentDeckCount}/6)` : ""}</span>
                    </button>
                )}
            </div>

            {/* Realistic Deck Constraint Notice */}
            <div className="my-3 px-4 py-2.5 bg-emerald-100/70 dark:bg-emerald-900/40 border border-emerald-300/80 dark:border-emerald-700/60 rounded-xl flex items-center justify-between text-xs text-emerald-900 dark:text-emerald-200">
                <div className="flex items-center gap-2">
                    <span className="text-base">📌</span>
                    <span>
                        <strong>Deck Rule:</strong> Exactly <strong>1x Borrowed MLB Card</strong> (Rental slot). The other <strong>5 slots</strong> are populated strictly from what you registered in the <strong>Card Collection Manager</strong> below at your exact Limit Breaks.
                    </span>
                </div>
            </div>

            {/* IN-GAME "TRAINING FOCUS" PRESET REPLICA */}
            <div className="my-4 bg-[#fbf9f4] dark:bg-gray-800/95 rounded-xl overflow-hidden border border-[#d8d2c2] dark:border-gray-700 shadow-md">
                {/* Green Header Banner Matching In-Game Screenshot */}
                <div className="bg-[#56b900] text-white px-4 py-1.5 flex items-center justify-between shadow-xs">
                    <span className="font-extrabold text-sm sm:text-base tracking-wide font-sans text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)]">
                        Training Focus
                    </span>
                    {/* The slanted white stripe cut on the right matching in-game UI */}
                    <div className="flex items-center gap-1 -skew-x-12 pr-1">
                        <div className="w-1.5 h-3.5 bg-white/90 rounded-[1px]" />
                        <div className="w-1.5 h-3.5 bg-white/90 rounded-[1px]" />
                    </div>
                </div>

                {/* 3 Radio Buttons horizontally matching in-game preparation screen */}
                <div className="flex flex-wrap sm:flex-nowrap items-center justify-around gap-4 px-6 py-4 bg-[#faf7f0] dark:bg-gray-900/60 border-b border-[#e8e2d4] dark:border-gray-700/60">
                    {(["Balanced", "Stamina", "Sprint"] as const).map((preset) => {
                        const isRecommended = recommendedPreset === preset;
                        const isSelected = activePreset === preset;
                        return (
                            <button
                                key={preset}
                                type="button"
                                onClick={() => handlePresetSelect(preset)}
                                className="group flex items-center gap-3 cursor-pointer py-1.5 px-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-all select-none"
                            >
                                {/* In-game authentic 3D styled radio circle */}
                                <div
                                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2 transition-all ${
                                        isSelected
                                            ? "border-[#7b8a7b] bg-gradient-to-b from-[#f0f2f0] to-[#cfd3cf] shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_2px_rgba(255,255,255,0.8)]"
                                            : "border-[#b8bab8] group-hover:border-gray-400 bg-gradient-to-b from-[#f8f8f8] to-[#d8d8d8] shadow-[inset_0_2px_3px_rgba(0,0,0,0.15)]"
                                    }`}
                                >
                                    {isSelected ? (
                                        <div className="w-4.5 h-4.5 rounded-full bg-gradient-to-b from-[#8fe704] via-[#62c900] to-[#449e00] shadow-[0_0_8px_#66ce00,inset_0_1px_2px_rgba(255,255,255,0.9)] border border-[#3e8a00]" />
                                    ) : (
                                        <div className="w-3.5 h-3.5 rounded-full bg-[#d2d4d2] shadow-inner opacity-30 group-hover:opacity-60 transition-opacity" />
                                    )}
                                </div>

                                <div className="flex items-center gap-2">
                                    <span
                                        className={`font-extrabold text-base sm:text-lg tracking-tight transition-colors ${
                                            isSelected
                                                ? "text-[#4d2812] dark:text-amber-200"
                                                : "text-[#5e3820]/90 dark:text-gray-300 group-hover:text-[#4d2812] dark:group-hover:text-white"
                                        }`}
                                    >
                                        {preset}
                                    </span>
                                    {isRecommended && (
                                        <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-lime-600 text-white shadow-xs tracking-wider uppercase">
                                            REC
                                        </span>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Preset Details Banner */}
                <div className="px-4 py-3 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700/60 text-xs">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="bg-lime-50/60 dark:bg-lime-950/30 p-2.5 rounded-lg border border-lime-200/80 dark:border-lime-900/60">
                            <span className="text-lime-800 dark:text-lime-300 font-semibold block mb-0.5">Optimal For:</span>
                            <span className="text-gray-800 dark:text-gray-200 font-medium">{activeDetails.targetRaces}</span>
                        </div>
                        <div className="bg-lime-50/60 dark:bg-lime-950/30 p-2.5 rounded-lg border border-lime-200/80 dark:border-lime-900/60">
                            <span className="text-lime-800 dark:text-lime-300 font-semibold block mb-0.5">Safe Stamina Target:</span>
                            <span className="text-gray-800 dark:text-gray-200 font-bold">{activeDetails.staminaTarget}</span>
                        </div>
                        <div className="bg-lime-50/60 dark:bg-lime-950/30 p-2.5 rounded-lg border border-lime-200/80 dark:border-lime-900/60">
                            <span className="text-lime-800 dark:text-lime-300 font-semibold block mb-0.5">Primary Stat Bias:</span>
                            <span className="text-gray-800 dark:text-gray-200 font-semibold">{activeDetails.primaryStats}</span>
                        </div>
                    </div>
                    <p className="text-gray-600 dark:text-gray-300 mt-2.5 leading-relaxed">
                        <strong className="text-lime-800 dark:text-lime-300">Bot Behavior:</strong> {activeDetails.botBehavior}
                    </p>
                </div>
            </div>

            {/* Core Pillars Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 my-4">
                {/* Pillar 1: Pals / Friends */}
                <div className="bg-white/80 dark:bg-gray-800/80 p-4 rounded-xl border border-emerald-200/80 dark:border-emerald-800/60 shadow-xs">
                    <div className="flex items-center gap-2 font-bold text-sm text-emerald-900 dark:text-emerald-200 mb-1.5">
                        <span>🤝</span>
                        <span>Pal / Friend Cards</span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                        <strong className="text-emerald-700 dark:text-emerald-300">SSS Priority:</strong> SSR Light Hello, Riko Kashimoto, etc. They stabilize energy, grant guaranteed outings, reduce training stamina consumption, and shield the bot from failures and injuries.
                    </p>
                </div>

                {/* Pillar 2: Initial Stats */}
                <div className="bg-white/80 dark:bg-gray-800/80 p-4 rounded-xl border border-emerald-200/80 dark:border-emerald-800/60 shadow-xs">
                    <div className="flex items-center gap-2 font-bold text-sm text-emerald-900 dark:text-emerald-200 mb-1.5">
                        <span>🚀</span>
                        <span>High Initial Stats</span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                        Guaranteed +30 to +45 base stats from turn 1. The bot cannot mismanage these—securing effortless Debut and early Junior race objectives without relying on RNG rainbow rolls.
                    </p>
                </div>

                {/* Pillar 3: Race Bonus & Passive Events */}
                <div className="bg-white/80 dark:bg-gray-800/80 p-4 rounded-xl border border-emerald-200/80 dark:border-emerald-800/60 shadow-xs">
                    <div className="flex items-center gap-2 font-bold text-sm text-emerald-900 dark:text-emerald-200 mb-1.5">
                        <span>🏁</span>
                        <span>Race Bonus &amp; Events</span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                        Simulated race participation delivers steady, risk-free returns. High Race Bonus (10-15%) amplifies post-race stat payouts and Skill Points. Event Recovery provides passive energy regeneration.
                    </p>
                </div>

                {/* Pillar 4: Priority Skills / Hints */}
                <div className="bg-white/80 dark:bg-gray-800/80 p-4 rounded-xl border border-emerald-200/80 dark:border-emerald-800/60 shadow-xs">
                    <div className="flex items-center gap-2 font-bold text-sm text-emerald-900 dark:text-emerald-200 mb-1.5">
                        <span>💡</span>
                        <span>Priority Skills &amp; Hints</span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                        The auto-bot prioritizes purchasing designated <em>Priority Skills</em>. High Hint Levels heavily discount SP costs, and targeting reliable recovery or acceleration skills is vital for factor inheritance.
                    </p>
                </div>
            </div>

            {/* Tactical Energy Management Notice */}
            <div className="bg-emerald-900 text-white rounded-xl p-4 sm:p-5 shadow-inner">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 font-bold text-sm text-emerald-200">
                        <span>⚡</span>
                        <span>AFK Energy Management &amp; Priority Skills Heuristics</span>
                    </div>
                    <span className="text-[11px] bg-emerald-800 text-emerald-200 font-mono px-2.5 py-0.5 rounded border border-emerald-600">
                        {selectedRaces.join(", ") || "Medium"} • {selectedStyles.join(", ") || "Pace Chaser"}
                    </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs mt-2.5">
                    <div className="bg-emerald-950/60 p-3 rounded-lg border border-emerald-700/50">
                        <strong className="text-emerald-300 block mb-1">Energy &amp; Outing Threshold: &lt; 50%</strong>
                        <span>Always schedule Pal/Friend outings immediately when energy drops below half. The in-game bot will avoid risky training sessions if energy stays above 50%.</span>
                    </div>
                    <div className="bg-emerald-950/60 p-3 rounded-lg border border-emerald-700/50">
                        <strong className="text-emerald-300 block mb-1">Priority Skills Recommendation:</strong>
                        <span>{activeDetails.prioritySkillsAdvice}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
