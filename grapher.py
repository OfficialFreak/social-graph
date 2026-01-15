import json
from itertools import combinations
from collections import Counter
import networkx as nx


CONTACTS_PATH = "export/contacts.json"
GROUPS_PATH = "export/groups.json"


def load_json(path: str):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def graphml_safe_value(v):
    """
    GraphML supports: str, int, float, bool (and lists/dicts are not supported).
    Convert None -> "" and everything else to a supported type.
    """
    if v is None:
        return ""
    if isinstance(v, (str, int, float, bool)):
        return v
    # Fallback: stringify anything else (e.g., unexpected types)
    return str(v)


def build_contact_graph(contacts: dict, groups: dict) -> nx.Graph:
    G = nx.Graph()

    # 1) Add nodes with sanitized attributes
    for contact_id, attrs in contacts.items():
        G.add_node(
            contact_id,
            telephoneNumber=graphml_safe_value(attrs.get("telephoneNumber")),
            nickname=graphml_safe_value(attrs.get("nickname")),
            savedName=graphml_safe_value(attrs.get("savedName")),
        )

    contact_ids = set(contacts.keys())

    # 2) Count shared-group co-memberships
    pair_counts = Counter()

    for group_id, members in groups.items():
        members_in_contacts = [m for m in members if m in contact_ids]
        members_in_contacts = list(dict.fromkeys(members_in_contacts))  # dedupe

        for u, v in combinations(sorted(members_in_contacts), 2):
            pair_counts[(u, v)] += 1

    # 3) Add edges with weight
    for (u, v), w in pair_counts.items():
        G.add_edge(u, v, weight=int(w))  # ensure plain int

    return G


def main():
    contacts = load_json(CONTACTS_PATH)
    groups = load_json(GROUPS_PATH)

    G = build_contact_graph(contacts, groups)

    print(f"Nodes: {G.number_of_nodes():,}")
    print(f"Edges: {G.number_of_edges():,}")

    nx.write_graphml(G, "contacts_shared_groups.graphml")
    nx.write_gexf(G, "contacts_shared_groups.gexf")


if __name__ == "__main__":
    main()
