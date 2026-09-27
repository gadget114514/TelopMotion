# Font sources

All fonts in this folder are licensed under the SIL Open Font License 1.1 (see `OFL.txt`).
They are static (non-variable) builds, downloaded by hand and committed so that the
Studio can load them with `SA.platform.readAsset` (`fetch()` on the web build, the
`asset:read` IPC in Electron).

| File | Family | Source | Retrieved |
|---|---|---|---|
| `NotoSans-Regular.ttf` | Noto Sans | https://github.com/notofonts/noto-fonts/raw/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf | 2026-09-27 |
| `NotoSans-Bold.ttf` | Noto Sans Bold | https://github.com/notofonts/noto-fonts/raw/main/hinted/ttf/NotoSans/NotoSans-Bold.ttf | 2026-09-27 |
| `NotoSerif-Regular.ttf` | Noto Serif | https://github.com/notofonts/noto-fonts/raw/main/hinted/ttf/NotoSerif/NotoSerif-Regular.ttf | 2026-09-27 |
| `NotoSansJP-Regular.otf` | Noto Sans JP (subset OTF) | https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/JP/NotoSansJP-Regular.otf | 2026-09-27 |
| `NotoSansJP-Bold.otf` | Noto Sans JP Bold (subset OTF) | https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/JP/NotoSansJP-Bold.otf | 2026-09-27 |
| `DelaGothicOne-Regular.ttf` | Dela Gothic One | https://github.com/google/fonts/raw/main/ofl/delagothicone/DelaGothicOne-Regular.ttf | 2026-09-27 |
| `BebasNeue-Regular.ttf` | Bebas Neue | https://github.com/google/fonts/raw/main/ofl/bebasneue/BebasNeue-Regular.ttf | 2026-09-27 |

The Noto Sans JP files load only when the text contains CJK characters (§6.3 of the design spec).
