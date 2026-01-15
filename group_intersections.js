const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

/**
 * Usage examples:
 *   node group_intersections.js --group "My Cool Group"
 *   node group_intersections.js --group "1234567890-1234567890@g.us"
 *
 * Optional:
 *   --exact   (match group name exactly, default is case-insensitive substring)
 */

function parseArgs(argv) {
    const args = { group: null, exact: false };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--group" && i + 1 < argv.length) args.group = argv[++i];
        else if (a === "--exact") args.exact = true;
    }
    return args;
}

function looksLikeGroupId(s) {
    return typeof s === "string" && s.endsWith("@g.us");
}

function normalizeName(s) {
    return (s || "").trim().toLowerCase();
}

const { group: GROUP_INPUT, exact: EXACT_MATCH } = parseArgs(process.argv);

if (!GROUP_INPUT) {
    console.error(
        'Missing --group argument. Example: node group_intersections.js --group "My Group"',
    );
    process.exit(1);
}

const client = new Client({
    puppeteer: {
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        headless: true,
    },
    authStrategy: new LocalAuth(),
    clientId: "Name",
});

client.on("qr", (qr) => qrcode.generate(qr, { small: true }));

client.on("ready", async () => {
    try {
        console.log("Client is ready. Loading chats & contacts...");
        const myId = client.info.wid._serialized;

        // Cache contact info to avoid repeated network calls
        const contactCache = new Map(); // idSerialized -> { number, name, pushname }

        // Warm cache with getContacts()
        const allContacts = await client.getContacts();
        for (const c of allContacts) {
            const id = c?.id?._serialized;
            if (!id) continue;
            contactCache.set(id, {
                number: c.number || "",
                name: c.name || "", // address book name (often only if saved)
                pushname: c.pushname || "", // WhatsApp profile name / nickname
            });
        }

        async function getContactInfo(idSerialized) {
            if (contactCache.has(idSerialized))
                return contactCache.get(idSerialized);

            // Fallback if not in getContacts() result
            try {
                const c = await client.getContactById(idSerialized);
                const info = {
                    number: c.number || "",
                    name: c.name || "",
                    pushname: c.pushname || "",
                };
                contactCache.set(idSerialized, info);
                return info;
            } catch {
                const info = { number: "", name: "", pushname: "" };
                contactCache.set(idSerialized, info);
                return info;
            }
        }

        const chats = await client.getChats();
        const groups = chats.filter((c) => c.isGroup);

        if (groups.length === 0) {
            console.log("No group chats found.");
            process.exit(0);
        }

        // Find the target group
        let targetGroup = null;

        if (looksLikeGroupId(GROUP_INPUT)) {
            targetGroup =
                groups.find((g) => g.id._serialized === GROUP_INPUT) || null;
        } else {
            const needle = normalizeName(GROUP_INPUT);
            if (EXACT_MATCH) {
                targetGroup =
                    groups.find((g) => normalizeName(g.name) === needle) ||
                    null;
            } else {
                targetGroup =
                    groups.find((g) =>
                        normalizeName(g.name).includes(needle),
                    ) || null;
            }
        }

        if (!targetGroup) {
            console.error("Target group not found.");
            console.error(
                "Tip: run with the exact group ID (ends with @g.us) or use --exact for exact name match.",
            );
            console.error("Your groups are:");
            for (const g of groups)
                console.error(`- ${g.name}   (${g.id._serialized})`);
            process.exit(1);
        }

        // Build participant set for target group
        const targetId = targetGroup.id._serialized;
        const targetName = targetGroup.name || targetId;

        const targetParticipants = new Set(
            (targetGroup.participants || [])
                .map((p) => p.id?._serialized)
                .filter((id) => id && id !== myId),
        );

        console.log(`\nTarget group: ${targetName} (${targetId})`);
        console.log(`Members in target: ${targetParticipants.size}\n`);

        // Compare with all other groups
        let any = false;

        for (const g of groups) {
            const gid = g.id._serialized;
            if (gid === targetId) continue;

            const gParticipants = (g.participants || [])
                .map((p) => p.id?._serialized)
                .filter((id) => id && id !== myId);

            // Intersection
            const intersection = [];
            for (const pid of gParticipants) {
                if (targetParticipants.has(pid)) intersection.push(pid);
            }

            if (intersection.length === 0) continue;
            any = true;

            const gName = g.name || gid;

            console.log(
                "============================================================",
            );
            console.log(`Intersection with: ${gName} (${gid})`);
            console.log(`Count: ${intersection.length}`);
            console.log(
                "------------------------------------------------------------",
            );

            // Sort by number if possible (stable output)
            const withInfos = [];
            for (const pid of intersection) {
                const info = await getContactInfo(pid);
                withInfos.push({ pid, ...info });
            }

            withInfos.sort((a, b) =>
                (a.number || "").localeCompare(b.number || ""),
            );

            for (const p of withInfos) {
                const number = p.number ? `+${p.number}` : "(no number)";
                const name = p.name || "(no address-book name)";
                const nick = p.pushname || "(no pushname)";
                console.log(
                    `${number} | name: ${name} | nickname: ${nick} | id: ${p.pid}`,
                );
            }
            console.log("");
        }

        if (!any) {
            console.log("No non-empty intersections found with other groups.");
        }
    } catch (err) {
        console.error("Error:", err);
    } finally {
        // You can leave the session running if you want.
        process.exit(0);
    }
});

client.initialize();
