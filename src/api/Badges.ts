/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import ErrorBoundary from "@components/ErrorBoundary";
import BadgeAPIPlugin from "@plugins/_api/badges";
import { ComponentType, HTMLProps } from "react";

export const enum BadgePosition {
    START,
    END
}

export interface ProfileBadge {
    /**
     * Badge id, unused by vencord, required by discord
     */
    id: string;
    /** The tooltip to show on hover. Required for image badges */
    description?: string;
    /** Custom component for the badge (tooltip not included) */
    component?: ComponentType<ProfileBadge & BadgeUserArgs>;
    /** The custom image to use */
    iconSrc?: string;
    link?: string;
    /** Action to perform when you click the badge */
    onClick?(event: React.MouseEvent, props: ProfileBadge & BadgeUserArgs): void;
    /** Action to perform when you right click the badge */
    onContextMenu?(event: React.MouseEvent, props: BadgeUserArgs & BadgeUserArgs): void;
    /** Should the user display this badge? */
    shouldShow?(userInfo: BadgeUserArgs): boolean;
    /** Optional props (e.g. style) for the badge, ignored for component badges */
    props?: HTMLProps<HTMLImageElement>;
    /** Insert at start or end? */
    position?: BadgePosition;
    /** The badge name to display, Discord uses this. Required for component badges */
    key?: string;

    /**
     * Allows dynamically returning multiple badges.
     * Must not call hooks
     */
    getBadges?(userInfo: BadgeUserArgs): ProfileBadge[];
}

const Badges = new Set<ProfileBadge>();

/**
 * Register a new badge with the Badges API
 * @param badge The badge to register
 */
export function addProfileBadge(badge: ProfileBadge) {
    badge.component &&= ErrorBoundary.wrap(badge.component, { noop: true });
    Badges.add(badge);
}

/**
 * Unregister a badge from the Badges API
 * @param badge The badge to remove
 */
export function removeProfileBadge(badge: ProfileBadge) {
    return Badges.delete(badge);
}

/**
 * Inject badges into the profile badges array.
 * You probably don't need to use this.
 */
export function _getBadges(args: BadgeUserArgs) {
    const badges = [] as ProfileBadge[];
    for (const badge of Badges) {
        if (badge.shouldShow && !badge.shouldShow(args)) {
            continue;
        }

        const b = badge.getBadges
            ? badge.getBadges(args).map(badge => ({
                ...args,
                ...badge,
                component: badge.component && ErrorBoundary.wrap(badge.component, { noop: true })
            }))
            : [{ ...args, ...badge }];

        if (badge.position === BadgePosition.START) {
            badges.unshift(...b);
        } else {
            badges.push(...b);
        }
    }

    const donorBadges = BadgeAPIPlugin.getDonorBadges(args.userId);
    if (donorBadges) {
        badges.unshift(
            ...donorBadges.map(badge => ({
                ...args,
                ...badge,
            }))
        );
    }

    return badges;
}

export interface BadgeUserArgs {
    userId: string;
    guildId: string;
}

// ===== KFO Custom Dev Badge =====

let hasRegisteredKfoBadge = false;

(async () => {
    try {
        const constants = await import("@utils/constants");
        const Devs: any = (constants as any).Devs;
        const DevsById: any = (constants as any).DevsById;
        const KFO_DEV_BADGE = (constants as any).KFO_DEV_BADGE;
        const KFO_PROFILE_CONFIG = (constants as any).KFO_PROFILE_CONFIG;

        if (!Devs || !KFO_DEV_BADGE) return;

        const kfoDev = Devs.rz30 ?? Devs.KFO;
        if (!kfoDev || !kfoDev.id) return;

        const kfoId = kfoDev.id.toString();

        if (hasRegisteredKfoBadge) return;
        hasRegisteredKfoBadge = true;

        addProfileBadge({
            id: "kfo-dev-badge",
            iconSrc: KFO_DEV_BADGE.icon,
            description: KFO_DEV_BADGE.description || KFO_DEV_BADGE.name || "KFO Dev",
            position: BadgePosition.START,
            shouldShow: ({ userId }) => userId === kfoId,
            onClick: () => {
                // محاولة أولى: افتح مودال المساهمات الرسمي (زي اللي في الصورة)
                try {
                    const contribModule = require("@plugins/contributors") as any;

                    const devInfo = DevsById[kfoDev.id];
                    if (contribModule && typeof contribModule.openContributorModal === "function" && devInfo) {
                        contribModule.openContributorModal(devInfo.id.toString());
                        return;
                    }
                } catch {
                    // لو فشلنا نفتح المودال الرسمي، نطيح لـ fallback
                }

                // Fallback: مودال نصي بسيط (alert) + نسخ للكلبورد
                try {
                    const cfg = KFO_PROFILE_CONFIG;
                    const lines: string[] = [];

                    lines.push(cfg.mainName || "KFO Profile");
                    lines.push("");

                    if (cfg.domains && cfg.domains.length) {
                        lines.push("المواقع:");
                        cfg.domains.forEach((d: any) => {
                            if (d.label && d.url) {
                                lines.push(`- ${d.label}: ${d.url}`);
                            }
                        });
                        lines.push("");
                    }

                    if (cfg.accounts && cfg.accounts.length) {
                        lines.push("الحسابات:");
                        cfg.accounts.forEach((a: any) => {
                            if (a.label && a.url) {
                                lines.push(`- ${a.label}: ${a.url}`);
                            }
                        });
                        lines.push("");
                    }

                    if (cfg.plugins && cfg.plugins.length) {
                        lines.push("البلوقنز:");
                        cfg.plugins.forEach((p: any) => {
                            if (p.name) {
                                const desc = p.description ? ` - ${p.description}` : "";
                                const url = p.url ? ` (${p.url})` : "";
                                lines.push(`- ${p.name}${desc}${url}`);
                            }
                        });
                        lines.push("");
                    }

                    if (cfg.friends && cfg.friends.length) {
                        lines.push("الأخويا:");
                        cfg.friends.forEach((f: any) => {
                            if (f.name) {
                                const url = f.url ? ` (${f.url})` : "";
                                lines.push(`- ${f.name}${url}`);
                            }
                        });
                        lines.push("");
                    }

                    const text = lines.join("\n");
                    try {
                        navigator.clipboard?.writeText(text).catch(() => {});
                    } catch {}
                    alert(text);
                } catch (e) {
                    console.error("KFO dev badge fallback failed:", e);
                }
            }
        });
    } catch (e) {
        console.error("KFO dev badge registration failed:", e);
    }
})();

// ===== KFO Friends Badges =====

let hasRegisteredKfoFriendsBadge = false;

(async () => {
    try {
        const constants = await import("@utils/constants");
        const KFO_FRIENDS_BADGE_ICON = (constants as any).KFO_FRIENDS_BADGE_ICON as string | undefined;
        const KFO_FRIENDS_BADGES = (constants as any).KFO_FRIENDS_BADGES as Array<{
            id: string;
            label: string;
            description: string;
        }> | undefined;

        if (!KFO_FRIENDS_BADGE_ICON || !Array.isArray(KFO_FRIENDS_BADGES) || !KFO_FRIENDS_BADGES.length) return;

        if (hasRegisteredKfoFriendsBadge) return;
        hasRegisteredKfoFriendsBadge = true;

        for (const friend of KFO_FRIENDS_BADGES) {
            const friendId = friend.id.toString();

            addProfileBadge({
                id: `kfo-friend-${friendId}`,
                iconSrc: KFO_FRIENDS_BADGE_ICON,
                description: friend.description || friend.label || "KFO Friend",
                position: BadgePosition.END,
                shouldShow: ({ userId }) => userId === friendId
            });
        }
    } catch (e) {
        console.error("KFO friends badges registration failed:", e);
    }
})();
