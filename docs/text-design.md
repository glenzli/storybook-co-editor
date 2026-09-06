# Text design suggestions / 文字排版建议

The style sidebar offers **Text design suggestions**. Generate local alternatives
with position and width locked, or allow a search across the page. Each alternative
uses the current text, font and font size. The original is retained for comparison.
Local scoring measures background texture and brightness distribution; it does not
claim to recognize faces or story objects. Candidates that clip the page or collide
with another text layer are excluded.

样式侧栏的「文字排版建议」可保留位置和宽度，也可搜索整页。候选保留原文、字体和字号，
同时展示原稿。局部评分参考背景纹理与明暗分布，不声称具备人物或故事物件识别能力；
越界和碰到其他文字层的候选会被排除。

With AI enabled and a local Codex connection available, select a model and compare
the rendered candidates. Luna is preferred when returned by the model list. Full
pages and text crops are sent through the existing authenticated Codex connection.
At most two review calls run per click, each with up to six candidates. One bounded
effect refinement may be rendered between calls; retained candidates are compared
again. Review failure or cancellation leaves candidates available. Token usage is
shown only when the app server reports it. Repeated reviews are explicit actions.

启用 AI 且本地 Codex 可连接时，可选择模型比较整页和文字局部图。模型列表中有 Luna
时优先选择。每次点击最多两轮、每轮最多六个候选；两轮之间最多进行一次效果微调。
取消或失败后仍可使用已有候选。仅在服务端返回用量时显示 tokens。

Suggestions remain outside project state until **Apply this design**. Applying is
one undoable update to the current page and active content language. Changed page,
language or project identity invalidates adoption. Close/reopen to regenerate.

建议只在「采用此方案」时写入当前内容语言的当前页，并可撤销。页面、语言或项目变化后
旧建议不可采用，需要重新生成。

Composite treatments independently control outline, halo and backdrop. Adaptive
wash contours follow line widths; a stored seed fixes edge variation. Tint, edge
variation and feathering are editable. **Vary wash shape** changes the seed. The
pigment wash uses three translucent glazes, broad edge pools, soft pigment accumulation
and subtle procedural granulation. The saved seed reproduces all paint passes. Legacy project effects retain their previous rendering until
edited. New project schema: `20260907.01`; legacy dated schemas are migrated.

组合效果可分别控制描边、光晕和底纹。底纹跟随行宽，保存种子以保持形状稳定；色调、
边缘变化和柔和度可调。「换一种底纹」更新种子。底纹由三层透明罩染、边缘浓淡色池、柔和积色与轻微颗粒组成；保存种子可复现浸染效果。旧项目在主动修改效果前保持原有底纹。项目版本更新为 `20260907.01`。

Canvas rendering and SVG editor overlays use the shared frozen text layout. Web
publication keeps its `20260906.02` ABI: combined stroke/shadow and the resolved wash
path fit existing fields; no procedural seed is required by a reader. The project
retains editable effects, while publication stores their resolved paint and geometry.

Editor SVG, local candidate Canvas previews and PDF share frozen pigment passes.
The `20260906.02` web publication ABI retains the simplified single-color wash
contour, without pigment texture; language-specific washes are never baked into
shared page artwork. Full pigment publication needs a future reader contract update.

编辑器、候选预览和 PDF 共用浸染绘制数据；网页出版仍输出兼容旧阅读器的单色底纹轮廓，暂不包含浸染纹理。
