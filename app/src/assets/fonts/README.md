# Bundled Fonts

These fonts are bundled so exported PDFs render text with the same local assets used by the editor preview.

- `google/`: local `woff2` subsets generated from Google Fonts CSS for `Noto Sans SC`, `Noto Serif SC`, and `ZCOOL KuaiLe`, with upstream OFL license files.
- `lxgw/`: `LXGW WenKai` regular `woff2` subsets from `lxgw-wenkai-webfont`, with its upstream OFL license file.
- `display/`: local display/title fonts for `Smiley Sans`, `ZCOOL QingKe HuangYou`, and `ZCOOL XiaoWei`, with upstream OFL license files.

If the bundled font list changes, regenerate the CSS and font files together so the `@font-face` declarations always point to local assets.
