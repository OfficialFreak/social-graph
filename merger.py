from pathlib import Path
import json

def main():
    base_dir = Path("export")
    
    result_contacts = {}
    result_groups = {}
    
    def name_len(contact: dict) -> int:
        return len((contact or {}).get("savedName") or "")
    
    for folder in base_dir.iterdir():
        if not folder.is_dir():
            continue
    
        contacts_path = folder / "contacts.json"
        groups_path = folder / "groups.json"
    
        if not contacts_path.exists() or not groups_path.exists():
            continue
    
        with contacts_path.open("r", encoding="utf-8") as f:
            contacts = json.load(f)
    
        for jid, contact in contacts.items():
            if jid not in result_contacts:
                result_contacts[jid] = contact
            else:
                # keep the one with the longer savedName
                if name_len(contact) > name_len(result_contacts[jid]):
                    result_contacts[jid] = contact
                # else keep existing
    
        with groups_path.open("r", encoding="utf-8") as f:
            result_groups |= json.load(f)
    
    
    out_contacts = Path("export/contacts.json")
    out_groups = Path("export/groups.json")
    
    out_contacts.parent.mkdir(parents=True, exist_ok=True)
    out_groups.parent.mkdir(parents=True, exist_ok=True)
    
    with out_contacts.open("w", encoding="utf-8") as f:
        json.dump(result_contacts, f, indent=2)
    with out_groups.open("w", encoding="utf-8") as f:
        json.dump(result_groups, f, indent=2)


if __name__ == "__main__":
    main()
