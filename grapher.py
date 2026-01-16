import json
from itertools import combinations
from collections import Counter, defaultdict
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

    # Add nodes
    for cid, attrs in contacts.items():
        G.add_node(
            cid,
            telephoneNumber=attrs.get("telephoneNumber") or "",
            nickname=attrs.get("nickname") or "",
            savedName=attrs.get("savedName") or "",
        )

    contact_ids = set(contacts.keys())

    # pair -> accumulated weight
    pair_weight = defaultdict(float)

    # pair -> set of shared group ids (for labeling)
    pair_groups = defaultdict(set)

    for group_id, members in groups.items():
        members_in_contacts = [m for m in members if m in contact_ids]
        members_in_contacts = list(dict.fromkeys(members_in_contacts))

        # n = len(members_in_contacts)
        n = len(members)
        if n < 2:
            continue

        contribution = 1.0 / n

        for u, v in combinations(sorted(members_in_contacts), 2):
            pair_weight[(u, v)] += contribution
            pair_groups[(u, v)].add(group_id)

    # Add edges
    for (u, v), weight in pair_weight.items():
        groups_sorted = sorted(pair_groups[(u, v)])

        G.add_edge(
            u,
            v,
            weight=weight,                     # fractional weight
            groups=",".join(groups_sorted),    # sorted group list
            group_count=len(groups_sorted),    # optional, integer
        )
    
    G.remove_nodes_from(list(nx.isolates(G)))

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
