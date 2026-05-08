/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 DonutSMPBalance contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { IpcMainInvokeEvent } from "electron";

const DONUT_STATS_PLAYER_URL = "https://donutstats.org/player.php?user=";
const FETCH_TIMEOUT_MS = 7500;
const MINECRAFT_NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const BALANCE_RE = />\s*Money\s*<\/span>\s*<span[^>]*>\s*([^<]+?)\s*<\/span>/i;

export interface DonutBalanceResult {
    success: boolean;
    balance?: string | null;
    error?: string;
}

export async function fetchBalance(
    _: IpcMainInvokeEvent,
    playerName: string
): Promise<DonutBalanceResult> {
    try {
        if (!MINECRAFT_NAME_RE.test(playerName)) {
            return { success: false, error: "Invalid Minecraft username." };
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        const response = await fetch(DONUT_STATS_PLAYER_URL + encodeURIComponent(playerName), {
            signal: controller.signal
        }).finally(() => clearTimeout(timeout));

        if (!response.ok) {
            return { success: false, error: `Fetch failed: ${response.status} ${response.statusText}` };
        }

        return {
            success: true,
            balance: parseBalance(await response.text())
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error"
        };
    }
}

function parseBalance(html: string): string | null {
    if (html.includes("Player not found or API error.")) return null;

    const match = html.match(BALANCE_RE);
    return match?.[1]?.trim() || null;
}
