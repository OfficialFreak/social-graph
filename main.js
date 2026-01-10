const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const fs = require("fs");

const client = new Client({
    puppeteer: {
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        headless: true,
    },
    authStrategy: new LocalAuth(),
    clientId: "Nils",
});

client.on("qr", (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on("ready", async () => {
    console.log("Client is ready! Lade Adressbuch...");

    const myId = client.info.wid._serialized;

    // 1. Adressbuch laden (Filter)
    const myContacts = await client.getContacts();
    const savedContactsMap = new Map();

    myContacts.forEach((contact) => {
        if (contact.id._serialized === myId) return;
        if (contact.isMyContact) {
            const realName = contact.name || contact.pushname || contact.number;
            savedContactsMap.set(contact.id._serialized, realName);
        }
    });

    console.log(`${savedContactsMap.size} Kontakte geladen.`);

    const chats = await client.getChats();
    const nodes = [];
    const edges = [];

    // Sets zum Vermeiden von Duplikaten
    const addedNodes = new Set();
    const addedEdges = new Set(); // Neu: Verhindert doppelte Linien

    // Hilfsfunktion: Knoten hinzufügen (nur wenn noch nicht existiert)
    function addNode(id, label, category) {
        if (!addedNodes.has(id)) {
            nodes.push({ id, label, category });
            addedNodes.add(id);
        }
    }

    // Hilfsfunktion: Kante hinzufügen
    function addEdge(source, target) {
        // Wir bauen einen einzigartigen String, um doppelte Kanten zu vermeiden
        // (z.B. wenn man 2 Chats mit derselben Person hat oder durch Glitches)
        const edgeId = `${source}-${target}`;
        if (!addedEdges.has(edgeId)) {
            edges.push({ source, target, type: "Undirected" });
            addedEdges.add(edgeId);
        }
    }

    // 2. DICH hinzufügen
    addNode(myId, "Ich (Nils)", "Me");

    for (const chat of chats) {
        // A) GRUPPEN LOGIK
        if (chat.isGroup) {
            const groupId = chat.id._serialized;
            const groupName = chat.name || "Unbekannte Gruppe";

            // Prüfen, ob Freunde drin sind (optional)
            const hasFriends = chat.participants.some((p) =>
                savedContactsMap.has(p.id._serialized),
            );

            // Wir fügen die Gruppe hinzu
            addNode(groupId, groupName, "Group");

            // Verbindung: Ich bin in der Gruppe
            addEdge(myId, groupId);

            // Teilnehmer durchgehen
            for (const participant of chat.participants) {
                const contactId = participant.id._serialized;
                if (contactId === myId) continue;

                // Nur wenn eingespeichert
                if (savedContactsMap.has(contactId)) {
                    // 1. Sicherstellen, dass der Person-Knoten existiert
                    addNode(
                        contactId,
                        savedContactsMap.get(contactId),
                        "Person",
                    );

                    // 2. Verbindung: Person ist in Gruppe
                    addEdge(contactId, groupId);
                }
            }
        }
        // B) EINZELCHAT LOGIK
        else {
            const contactId = chat.id._serialized;
            if (contactId === myId) continue;
            if (contactId === "status@broadcast") continue;

            // Nur wenn eingespeichert
            if (savedContactsMap.has(contactId)) {
                // 1. Sicherstellen, dass der Person-Knoten existiert
                // (Wichtig: Auch wenn er oben bei "Gruppe" schon erstellt wurde, macht addNode() hier nichts kaputt, weil es prüft)
                addNode(contactId, savedContactsMap.get(contactId), "Person");

                // 2. Verbindung: Ich habe einen direkten Chat mit der Person
                // DAS HIER HAT VORHER GEFEHLT, wenn die Person schon in einer Gruppe war!
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

    fs.writeFileSync("whatsapp_final_nodes.csv", nodesCsvContent);
    fs.writeFileSync("whatsapp_final_edges.csv", edgesCsvContent);

    console.log(
        `Fertig! ${nodes.length} Knoten und ${edges.length} Verbindungen.`,
    );
});

client.initialize();
