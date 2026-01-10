const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const fs = require("fs");

// --- KONFIGURATION ---
// true  = Nur Leute anzeigen, die du eingespeichert hast (Filter AN)
// false = Alle anzeigen, auch unbekannte Nummern in Gruppen (Filter AUS)
const ONLY_SAVED_CONTACTS = false;
// ---------------------

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

client.on("ready", async () => {
    console.log("Client is ready! Lade Daten...");
    console.log(
        `Modus: ${ONLY_SAVED_CONTACTS ? "Nur gespeicherte Kontakte" : "ALLE Kontakte (Full Graph)"}`,
    );

    const myId = client.info.wid._serialized;
    const myRealName = client.info.pushname || client.info.wid.user;

    // 1. Adressbuch laden (um Namen aufzulösen)
    const myContacts = await client.getContacts();
    const savedContactsMap = new Map();

    myContacts.forEach((contact) => {
        if (contact.id._serialized === myId) return;
        if (contact.isMyContact) {
            const realName = contact.name || contact.pushname || contact.number;
            savedContactsMap.set(contact.id._serialized, realName);
        }
    });

    console.log(`${savedContactsMap.size} gespeicherte Kontakte geladen.`);

    const chats = await client.getChats();
    const nodes = [];
    const edges = [];
    const addedNodes = new Set();
    const addedEdges = new Set();

    // --- HELPER FUNKTIONEN ---

    // Findet den Namen: Entweder aus Adressbuch oder die Nummer
    function getName(id) {
        if (savedContactsMap.has(id)) {
            return savedContactsMap.get(id);
        }
        return id.split("@")[0]; // Fallback: Nummer
    }

    function addNode(id, label, category) {
        if (!addedNodes.has(id)) {
            nodes.push({ id, label, category });
            addedNodes.add(id);
        }
    }

    function addEdge(source, target) {
        // Sortieren, damit A->B und B->A als gleiche Verbindung gelten (für Undirected Graph)
        const [u, v] = [source, target].sort();
        const edgeId = `${u}-${v}`;

        if (!addedEdges.has(edgeId)) {
            edges.push({ source, target, type: "Undirected" });
            addedEdges.add(edgeId);
        }
    }

    // 2. DICH hinzufügen
    addNode(myId, `${myRealName} (Ich)`, "Me");

    console.log(`${chats.length} Chats werden verarbeitet...`);

    for (const chat of chats) {
        // --- A) GRUPPEN ---
        if (chat.isGroup) {
            const groupId = chat.id._serialized;
            const groupName = chat.name || "Unbekannte Gruppe";

            // Wenn Filter AN ist: Prüfen ob überhaupt Freunde drin sind
            if (ONLY_SAVED_CONTACTS) {
                const hasFriends = chat.participants.some((p) =>
                    savedContactsMap.has(p.id._serialized),
                );
                // Optional: Leere Gruppen ausblenden? Wenn ja, hier 'continue' rein.
                // Aber wir lassen Gruppen drin, solange DU drin bist.
            }

            // Gruppe erstellen & mich verbinden
            addNode(groupId, groupName, "Group");
            addEdge(myId, groupId);

            // Teilnehmer durchgehen
            for (const participant of chat.participants) {
                const contactId = participant.id._serialized;
                if (contactId === myId) continue;

                const isSaved = savedContactsMap.has(contactId);

                // LOGIK: Hinzufügen, wenn (Filter AUS) ODER (Kontakt gespeichert)
                if (!ONLY_SAVED_CONTACTS || isSaved) {
                    addNode(contactId, getName(contactId), "Person");
                    addEdge(contactId, groupId);
                }
            }
        }
        // --- B) EINZELCHATS ---
        else {
            const contactId = chat.id._serialized;
            if (contactId === myId) continue;
            if (contactId === "status@broadcast") continue;

            const isSaved = savedContactsMap.has(contactId);

            // LOGIK: Hinzufügen, wenn (Filter AUS) ODER (Kontakt gespeichert)
            if (!ONLY_SAVED_CONTACTS || isSaved) {
                addNode(contactId, getName(contactId), "Person");
                addEdge(myId, contactId);
            }
        }
    }

    // --- CSV EXPORT ---
    let nodesCsvContent = "Id,Label,Category\n";
    nodes.forEach((node) => {
        const cleanLabel = (node.label || "")
            .replace(/"/g, "")
            .replace(/,/g, " ");
        nodesCsvContent += `${node.id},"${cleanLabel}",${node.category}\n`;
    });

    let edgesCsvContent = "Source,Target,Type\n";
    edges.forEach((edge) => {
        edgesCsvContent += `${edge.source},${edge.target},${edge.type}\n`;
    });

    // Dateinamen je nach Modus anpassen, damit du nichts überschreibst
    const prefix = ONLY_SAVED_CONTACTS ? "filtered" : "full";

    fs.writeFileSync(`whatsapp_${prefix}_nodes.csv`, nodesCsvContent);
    fs.writeFileSync(`whatsapp_${prefix}_edges.csv`, edgesCsvContent);

    console.log(
        `Fertig! Dateien erstellt: whatsapp_${prefix}_nodes.csv / _edges.csv`,
    );
    console.log(
        `Statistik: ${nodes.length} Knoten, ${edges.length} Verbindungen.`,
    );
});

client.initialize();
