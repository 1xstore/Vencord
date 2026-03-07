/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "انت تكتب",
    description: "Shows you if other people can see you typing.",
    authors: [Devs.r3r1, Devs.rz30
    , {
        name: "l2cu",
        id: 1208352443512004648n
}],

    patches: [
        {
            find: "\"handleDismissInviteEducation\"",
            replacement: {
                match: /\i\.default\.getCurrentUser\(\)/,
                replace: "\"\""
            }
        }
    ]
});
