/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 DonutSMPBalance contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import type { MessageDecorationProps } from "@api/MessageDecorations";
import definePlugin, { PluginNative } from "@utils/types";
import { FluxDispatcher, GuildMemberStore, GuildStore, React, Tooltip, useEffect, useState, useStateFromStores } from "@webpack/common";

const DONUT_SMP_GUILD_ID = "299949507989340160";
const CACHE_TTL = 10 * 60 * 1000;
const MAX_BALANCE_CACHE_ENTRIES = 500;
const MAX_REQUESTED_MEMBERS = 1000;
const MINECRAFT_NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const MINECRAFT_NAME_SEARCH_RE = /[A-Za-z0-9_]{3,16}/;

const Native = VencordNative?.pluginHelpers?.DonutSMPBalance as PluginNative<typeof import("./native")> | undefined;

interface BalanceCacheEntry {
    balance: string | null;
    expiresAt: number;
}

const balanceCache = new Map<string, BalanceCacheEntry>();
const pendingBalanceRequests = new Map<string, Promise<string | null>>();
const requestedMembers = new Set<string>();

function getPlayerCacheKey(playerName: string) {
    return playerName.toLowerCase();
}

function rememberRequestedMember(userId: string) {
    if (requestedMembers.size >= MAX_REQUESTED_MEMBERS) {
        const oldestUserId = requestedMembers.values().next().value;
        if (oldestUserId) requestedMembers.delete(oldestUserId);
    }

    requestedMembers.add(userId);
}

function requestDonutMember(userId: string) {
    if (!GuildStore.getGuild(DONUT_SMP_GUILD_ID)) return;
    if (requestedMembers.has(userId) || GuildMemberStore.getMember(DONUT_SMP_GUILD_ID, userId)) return;

    rememberRequestedMember(userId);
    FluxDispatcher.dispatch({
        type: "GUILD_MEMBERS_REQUEST",
        guildIds: [DONUT_SMP_GUILD_ID],
        userIds: [userId],
        presences: false
    });
}

function getMinecraftName(nick: string | null | undefined) {
    const cleanNick = nick?.trim().replace(/^@+/, "");
    if (!cleanNick) return null;

    if (MINECRAFT_NAME_RE.test(cleanNick)) return cleanNick;

    return cleanNick.match(MINECRAFT_NAME_SEARCH_RE)?.[0] ?? null;
}

function getCachedBalance(playerName: string) {
    const cacheKey = getPlayerCacheKey(playerName);
    const cached = balanceCache.get(cacheKey);
    if (!cached) return undefined;

    if (cached.expiresAt <= Date.now()) {
        balanceCache.delete(cacheKey);
        return undefined;
    }

    return cached.balance;
}

function cacheBalance(playerName: string, balance: string | null) {
    if (balanceCache.size >= MAX_BALANCE_CACHE_ENTRIES) {
        const oldestCacheKey = balanceCache.keys().next().value;
        if (oldestCacheKey) balanceCache.delete(oldestCacheKey);
    }

    balanceCache.set(getPlayerCacheKey(playerName), {
        balance,
        expiresAt: Date.now() + CACHE_TTL
    });
}

async function fetchBalance(playerName: string) {
    const cached = getCachedBalance(playerName);
    if (cached !== undefined) return cached;

    const cacheKey = getPlayerCacheKey(playerName);
    const pending = pendingBalanceRequests.get(cacheKey);
    if (pending) return pending;

    const request = (Native?.fetchBalance(playerName) ?? Promise.resolve({ success: false, balance: null }))
        .then(result => result.success ? result.balance ?? null : null)
        .catch(error => {
            console.error("[DonutSMPBalance] Failed to fetch balance", error);
            return null;
        })
        .then(balance => {
            cacheBalance(playerName, balance);
            return balance;
        })
        .finally(() => {
            pendingBalanceRequests.delete(cacheKey);
        });

    pendingBalanceRequests.set(cacheKey, request);
    return request;
}

function DonutBalance({ authorNick, channelGuildId, username, userId }: {
    authorNick?: string;
    channelGuildId?: string;
    username?: string;
    userId: string;
}) {
    const member = useStateFromStores(
        [GuildMemberStore],
        () => GuildMemberStore.getMember(DONUT_SMP_GUILD_ID, userId)
    );
    const isDonutChannel = channelGuildId === DONUT_SMP_GUILD_ID;
    const localDonutNick = isDonutChannel && authorNick && authorNick !== username ? authorNick : null;
    const playerName = getMinecraftName(member?.nick ?? localDonutNick);
    const [balance, setBalance] = useState(() => playerName ? getCachedBalance(playerName) : undefined);

    useEffect(() => {
        if (!isDonutChannel) requestDonutMember(userId);
    }, [isDonutChannel, userId]);

    useEffect(() => {
        let cancelled = false;

        if (!playerName) {
            setBalance(undefined);
            return;
        }

        const cached = getCachedBalance(playerName);
        if (cached !== undefined) {
            setBalance(cached);
            return;
        }

        setBalance(undefined);
        void fetchBalance(playerName).then(nextBalance => {
            if (!cancelled) setBalance(nextBalance);
        });

        return () => {
            cancelled = true;
        };
    }, [playerName]);

    if (!playerName || !balance) return null;

    return (
        <Tooltip text={`DonutSMP balance for ${playerName}`}>
            {tooltipProps => (
                <span {...tooltipProps} className="vc-donut-smp-balance">
                    ${balance}
                </span>
            )}
        </Tooltip>
    );
}

export default definePlugin({
    name: "DonutSMPBalance",
    description: "Shows a DonutSMP money balance beside chat usernames when their DonutSMP Discord nickname matches a player.",
    tags: ["Chat", "Utility"],
    authors: [{ name: "Nybotic", id: 0n }],
    source: "https://github.com/nybotic/DonutSMPBalance",
    dependencies: ["MessageDecorationsAPI"],

    renderMessageDecoration(props: MessageDecorationProps) {
        const userId = props.message?.author?.id;
        if (!userId) return null;

        return (
            <DonutBalance
                authorNick={props.author?.nick}
                channelGuildId={props.channel?.guild_id}
                username={props.message.author.username}
                userId={userId}
            />
        );
    }
});
