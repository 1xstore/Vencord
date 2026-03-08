import definePlugin, { OptionType } from "@utils/types";
import { Logger } from "@utils/Logger";
import {
    UserStore,
    ChannelStore,
    GuildStore,
    Toasts,
    showToast
} from "@webpack/common";
import * as DataStore from "@api/DataStore";
import { findByPropsLazy } from "@webpack";
import { Settings } from "@api/Settings";

interface VoiceState {
    userId: string;
    channelId?: string;
    oldChannelId?: string;
}

type NotifyMode = "DM" | "CHANNEL";

const logger = new Logger("VoiceMultiNotify", "#e67e22");
const LOG_KEY = "VoiceMultiNotify_lastSent";

let PrivateChannelStore: any;
let MessageActions: any;

try {
    PrivateChannelStore = findByPropsLazy("getPrivateChannelIds", "getDMFromUserId");
} catch {}

try {
    MessageActions = findByPropsLazy("sendMessage", "editMessage");
} catch {}

const defaultSettings = {
    // IDs مفصولة بفواصل
    targetUserIds: "",
    targetChannelIds: "",
    notifyMode: "DM" as NotifyMode,
    // لو DM:
    notifyUserId: "",
    // لو CHANNEL:
    notifyChannelId: "",
    minIntervalMs: 5000
};

function parseIds(value: string): string[] {
    return value
        .split(/[,\s]+/)
        .map(x => x.trim())
        .filter(Boolean);
}

async function ensureDMChannel(userId: string): Promise<string | null> {
    try {
        if (!PrivateChannelStore) return null;

        if (PrivateChannelStore.getDMFromUserId) {
            const dmId = PrivateChannelStore.getDMFromUserId(userId);
            if (dmId) return dmId;
        }

        return null;
    } catch (err) {
        logger.error("ensureDMChannel error:", err);
        return null;
    }
}

async function sendMessageToChannel(channelId: string, content: string) {
    if (!MessageActions) {
        showToast("VoiceMultiNotify: MessageActions غير متوفر", Toasts.Type.FAILURE);
        return;
    }

    try {
        await MessageActions.sendMessage(channelId, { content });
    } catch (err) {
        logger.error("sendMessageToChannel error:", err);
    }
}

async function sendDM(userId: string, content: string) {
    if (!MessageActions) {
        showToast("VoiceMultiNotify: MessageActions غير متوفر", Toasts.Type.FAILURE);
        return;
    }

    try {
        const dmId = await ensureDMChannel(userId);
        if (!dmId) {
            showToast("VoiceMultiNotify: ما قدرت أجيب روم الخاص", Toasts.Type.FAILURE);
            return;
        }

        await MessageActions.sendMessage(dmId, { content });
    } catch (err) {
        logger.error("sendDM error:", err);
    }
}

function shouldNotify(state: VoiceState, targetUsers: string[], targetChannels: string[]): boolean {
    if (!state.channelId) return false;
    if (!targetUsers.includes(state.userId)) return false;
    if (targetChannels.length > 0 && !targetChannels.includes(state.channelId)) return false;
    return true;
}

async function handleVoiceJoin(
    state: VoiceState,
    targetUsers: string[],
    targetChannels: string[],
    notifyMode: NotifyMode,
    notifyUserId: string,
    notifyChannelId: string,
    minIntervalMs: number
) {
    if (!shouldNotify(state, targetUsers, targetChannels)) return;

    const user = UserStore.getUser(state.userId);
    const channel = ChannelStore.getChannel(state.channelId!);
    const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : null;

    const username = user?.globalName || user?.username || state.userId;
    const channelName = channel?.name || "Unknown Channel";
    const guildName = guild?.name || "Unknown Guild";

    const now = new Date();
    const timeText = now.toLocaleString();

    const content = `👂 ${username} دخل الروم الصوتي #${channelName} في ${guildName}\n🕒 ${timeText}`;

    // منع السبام العام
    const nowMs = Date.now();
    const last = (await DataStore.get(LOG_KEY)) as number | null;
    if (last && nowMs - last < minIntervalMs) return;

    await DataStore.set(LOG_KEY, nowMs);

    if (notifyMode === "DM") {
        if (!notifyUserId) {
            showToast("VoiceMultiNotify: حط notifyUserId في الإعدادات", Toasts.Type.MESSAGE);
            return;
        }
        await sendDM(notifyUserId, content);
    } else {
        if (!notifyChannelId) {
            showToast("VoiceMultiNotify: حط notifyChannelId في الإعدادات", Toasts.Type.MESSAGE);
            return;
        }
        await sendMessageToChannel(notifyChannelId, content);
    }

    logger.info("Notification sent:", content);
}

export default definePlugin({
    name: "VoiceMultiNotify",
    description: "يرسل إشعار (DM أو في قناة) لما أشخاص معيّنين يدخلون رومات صوت معيّنة.",
    authors: [Devs.r3r1, Devs.rz30,],

    settings: {
        targetUserIds: {
            type: OptionType.STRING,
            description: "IDs المستخدمين المستهدفين (مفصولة بفواصل أو مسافات)",
            default: defaultSettings.targetUserIds
        },
        targetChannelIds: {
            type: OptionType.STRING,
            description: "IDs رومات الصوت المستهدفة (فاضي = أي روم)، مفصولة بفواصل",
            default: defaultSettings.targetChannelIds
        },
        notifyMode: {
            type: OptionType.SELECT,
            description: "طريقة الإشعار",
            options: [
                { label: "DM (خاص)", value: "DM" },
                { label: "Channel (قناة نصية)", value: "CHANNEL" }
            ],
            default: defaultSettings.notifyMode
        },
        notifyUserId: {
            type: OptionType.STRING,
            description: "لو اخترت DM: حط هنا ID حسابك اللي يستقبل الخاص",
            default: defaultSettings.notifyUserId
        },
        notifyChannelId: {
            type: OptionType.STRING,
            description: "لو اخترت Channel: حط هنا ID القناة النصية اللي تستقبل الإشعارات",
            default: defaultSettings.notifyChannelId
        },
        minIntervalMs: {
            type: OptionType.NUMBER,
            description: "أقل زمن بين إشعار وآخر (ميلّي ثانية)، مثلاً 5000 = 5 ثوان",
            default: defaultSettings.minIntervalMs
        }
    },

    flux: {
        async VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[] }) {
            try {
                if (!voiceStates || !Array.isArray(voiceStates) || voiceStates.length === 0) return;

                const pluginSettings = (Settings.plugins as any).VoiceMultiNotify ?? {};
                const targetUsers = parseIds(pluginSettings.targetUserIds ?? defaultSettings.targetUserIds);
                const targetChannels = parseIds(pluginSettings.targetChannelIds ?? defaultSettings.targetChannelIds);
                const notifyMode = (pluginSettings.notifyMode ?? defaultSettings.notifyMode) as NotifyMode;
                const notifyUserId = pluginSettings.notifyUserId ?? defaultSettings.notifyUserId;
                const notifyChannelId = pluginSettings.notifyChannelId ?? defaultSettings.notifyChannelId;
                const minIntervalMs = Number(pluginSettings.minIntervalMs ?? defaultSettings.minIntervalMs) || 5000;

                if (!MessageActions) {
                    // لو مافيه MessageActions، البلوقن ما يقدر يرسل
                    return;
                }

                for (const state of voiceStates) {
                    try {
                        if (state.channelId && state.channelId !== state.oldChannelId) {
                            await handleVoiceJoin(
                                state,
                                targetUsers,
                                targetChannels,
                                notifyMode,
                                notifyUserId,
                                notifyChannelId,
                                minIntervalMs
                            );
                        }
                    } catch (err) {
                        logger.error("Error in VOICE_STATE_UPDATES loop:", err);
                    }
                }
            } catch (err) {
                logger.error("Critical error in VOICE_STATE_UPDATES:", err);
            }
        }
    },

    async start() {
        logger.info("VoiceMultiNotify started");
        logger.info("ضبط الإعدادات من واجهة البلوقنز: المستخدمين، الرومات، وطريقة الإشعار.");
    },

    stop() {
        logger.info("VoiceMultiNotify stopped");
    }
});
