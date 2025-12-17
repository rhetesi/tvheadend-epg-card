# tvheadend-epg-card
EPG Card for Home Assistant data from TVHeadend

# TVHeadend EPG Timeline Card

Kodi-szerű EPG Lovelace kártya TVHeadendhez.

## Telepítés (HACS)

1. HACS → Frontend
2. Custom repositories
3. Add repository URL
4. Category: Lovelace
5. Telepítés
6. Cache frissítés (Ctrl+F5)

## Használat

```yaml
type: custom:tvheadend-epg-card
entity: sensor.tvheadend_epg
hours: 4
rowHeight: 52
