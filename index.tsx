/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 DonutSMPBalance contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import type { MessageDecorationProps } from "@api/MessageDecorations";
import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin, { PluginNative } from "@utils/types";
import { FluxDispatcher, GuildMemberStore, GuildStore, React, ReactDOM, Tooltip, UserStore, useEffect, useLayoutEffect, useRef, useState, useStateFromStores } from "@webpack/common";

const DONUT_SMP_GUILD_ID = "299949507989340160";
const USER_JOIN_MESSAGE_TYPE = 7;
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

function getMessageTargetUser(message?: MessageDecorationProps["message"]) {
    if (message?.type !== 0) {
        const mention = message?.mentions?.[0];
        if (mention) return typeof mention === "string" ? UserStore.getUser(mention) : mention;
    }

    const author = message?.author;
    if (author?.id) return author;

    const mention = message?.mentions?.[0];
    return typeof mention === "string" ? UserStore.getUser(mention) : mention;
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

function WelcomeMessageBalance({ authorNick, channelGuildId, messageId, username, userId }: {
    authorNick?: string;
    channelGuildId?: string;
    messageId?: string;
    username?: string;
    userId: string;
}) {
    const anchorRef = useRef<HTMLSpanElement>(null);
    const [portalTarget, setPortalTarget] = useState<HTMLSpanElement | null>(null);
    const displayName = authorNick ?? username;

    useLayoutEffect(() => {
        const anchor = anchorRef.current;
        if (!anchor || !displayName) return;

        const messageRow = anchor.closest("[id^='message-'], li, [role='article']");
        if (!messageRow) return;

        const previousTarget = messageId
            ? messageRow.querySelector(`.vc-donut-smp-welcome-inline-target[data-message-id="${messageId}"]`)
            : null;
        previousTarget?.remove();

        const walker = document.createTreeWalker(messageRow, NodeFilter.SHOW_ELEMENT);
        let nameElement: HTMLElement | null = null;

        while (walker.nextNode()) {
            const element = walker.currentNode;
            if (!(element instanceof HTMLElement) || element.contains(anchor)) continue;
            if (element.children.length > 1) continue;
            if (element.textContent?.trim() !== displayName) continue;

            nameElement = element;
            break;
        }

        if (!nameElement) return;

        const target = document.createElement("span");
        target.className = "vc-donut-smp-welcome-inline-target";
        if (messageId) target.dataset.messageId = messageId;
        nameElement.insertAdjacentElement("afterend", target);
        setPortalTarget(target);

        return () => {
            setPortalTarget(null);
            target.remove();
        };
    }, [displayName, messageId]);

    const balance = (
        <span className="vc-donut-smp-welcome-balance">
            <DonutBalance
                authorNick={authorNick}
                channelGuildId={channelGuildId}
                username={username}
                userId={userId}
            />
        </span>
    );

    return (
        <>
            <span ref={anchorRef} className="vc-donut-smp-welcome-anchor" />
            {portalTarget ? ReactDOM.createPortal(balance, portalTarget) : balance}
        </>
    );
}

export default definePlugin({
    name: "DonutSMPBalance",
    description: "Shows a DonutSMP money balance beside chat usernames when their DonutSMP Discord nickname matches a player.",
    tags: ["Chat", "Utility"],
    authors: [{ name: "Nybotic", id: 0n }],
    source: "https://github.com/nybotic/DonutSMPBalance",
    dependencies: ["MessageDecorationsAPI", "MessageAccessoriesAPI"],

    renderMessageDecoration(props: MessageDecorationProps) {
        const user = getMessageTargetUser(props.message);
        const userId = user?.id;
        if (!userId) return null;

        return (
            <DonutBalance
                authorNick={props.author?.nick}
                channelGuildId={props.channel?.guild_id}
                username={user.username}
                userId={userId}
            />
        );
    },

    renderMessageAccessory(props: Record<string, any>) {
        if (props.message?.type !== USER_JOIN_MESSAGE_TYPE) return null;

        const user = getMessageTargetUser(props.message);
        const userId = user?.id;
        if (!userId) return null;

        return (
            <ErrorBoundary noop>
                <WelcomeMessageBalance
                    authorNick={props.author?.nick ?? user.username}
                    channelGuildId={props.channel?.guild_id}
                    messageId={props.message.id}
                    username={user.username}
                    userId={userId}
                />
            </ErrorBoundary>
        );
    }
});
