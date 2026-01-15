const fs = require("fs/promises");
const path = require("path");
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");

const OUT_DIR = path.resolve("./export");
const CONTACTS_FILE = path.join(OUT_DIR, "contacts.json");
const GROUPS_FILE = path.join(OUT_DIR, "groups.json");
const USERS_FILE = path.join(OUT_DIR, "users.json");

const client = new Client({
    puppeteer: {
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        headless: true,
    },
    authStrategy: new LocalAuth(),
    clientId: "Name", // Session Name
});

client.on("qr", (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on("authenticated", () => {
    console.log("Authenticated");
});

client.on("ready", async () => {
    console.log("Client ready");

    await fs.mkdir(OUT_DIR, { recursive: true });

    /*
     * 1) CONTACTS
     * contact_id -> { telephoneNumber, nickname, savedName }
     */
    console.log("getting contacts");
    const contactsArr = (await client.getContacts()).filter(
        (c) => c && c.id && c.id._serialized && c.isMyContact,
    );
    const contacts = {};

    console.log(`Downloading information about ${contactsArr.length} contacts`);
    for (const c of contactsArr) {
        let profilePicUrl = null;
        try {
            profilePicUrl = await c.getProfilePicUrl();
        } catch {
            profilePicUrl = null;
        }

        contacts[c.id._serialized] = {
            telephoneNumber: c.number ?? null,
            nickname: c.pushname ?? null,
            savedName: c.name ?? null,
            profilePicUrl,
        };
    }

    await fs.writeFile(
        CONTACTS_FILE,
        JSON.stringify(contacts, null, 2),
        "utf8",
    );

    /*
     * 2) GROUPS
     * group_id -> [user_id, ...]
     */
    console.log("getting groups");
    const chats = await client.getChats();
    const groupChats = chats.filter((ch) => ch.isGroup);

    const groups = {};
    const userIds = new Set(Object.keys(contacts));

    for (const g of groupChats) {
        if (!g.id || !g.id._serialized) continue;

        const gid = g.id._serialized;
        const participantIds = [];

        for (const p of g.participants || []) {
            if (!p.id || !p.id._serialized) continue;

            const pid = p.id._serialized;
            participantIds.push(pid);
            userIds.add(pid);
        }

        groups[gid] = participantIds;
    }

    await fs.writeFile(GROUPS_FILE, JSON.stringify(groups, null, 2), "utf8");

    /*
     * 3) USERS
     * user_id -> { nickname, profilePicUrl }
     */
    // skip as this is to much for whatsapp
    console.log("skipping users");
    /* console.log("getting users");
    const users = {};

    for (const uid of userIds) {
        try {
            const contact = await client.getContactById(uid);

            let profilePicUrl = null;
            try {
                profilePicUrl = await contact.getProfilePicUrl();
            } catch {
                profilePicUrl = null;
            }

            users[uid] = {
                nickname: contact.pushname ?? null,
                profilePicUrl,
            };
        } catch (err) {
            users[uid] = {
                nickname: null,
                profilePicUrl: null,
                error: err?.message || String(err),
            };
        }
    }

    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), "utf8");*/

    console.log("Export complete");
    console.log(" -", CONTACTS_FILE);
    console.log(" -", GROUPS_FILE);
    // console.log(" -", USERS_FILE);

    await client.destroy();
});

client.initialize();
