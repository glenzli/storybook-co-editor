const messages = {
  'zh-CN': {
    reference: '参考图',
    alignStyle: '对齐样式',
    referenceAction: '参考',
    failed: '失败',
    sendFailedDetail: '发送失败：{error}',
    sendFailedDesktop: '发送失败，请确认桌面端已打开',
    inTrash: '在回收站',
    inTrashToast: '这张图片已在 app 回收站中，请先在 app 里恢复或清理后再发送',
    duplicate: '已存在',
    duplicateToast: '这张图片已经在当前项目中',
    success: '成功',
    successToast: '图片已发送到 Storybook Co-Editor',
    send: '发送',
    setAsReference: '已设为参考',
    preparing: '准备中...',
    filled: '已填入',
    filledToast: 'Prompt 和图片已填入对话框，请检查后发送',
    textFilled: '文字已填入',
    textFilledToast: 'Prompt 已填入，请手动上传两张图片（先参考图，后目标图）',
    copied: '已复制',
    copiedToast: 'Prompt 已复制到剪切板，请粘贴到对话框并上传两张图片',
    operationFailed: '操作失败，请重试',
    extracting: '提取中...',
    sending: '发送中...',
    stylePrompt: `请仔细对比以下两张图片。

图1是【参考图 / 风格基准】，图2是【目标图 / 需要调整的图】。

请执行以下任务：
1. 分析图2相对于图1，在以下维度上存在哪些具体差异：画风笔触、色调色温、光影氛围、线条质感、材质纹理、整体视觉风格
2. 基于你的分析结果，编写一段精确的图像生成 Prompt，要求：
   - 完整保留图2的构图、主体内容和叙事场景
   - 将图2的视觉风格完全对齐到图1
   - Prompt 需要足够具体和详细，可直接用于图像生成
3. 使用你编写的 Prompt，直接重新生成图2`,
  },
  'en-US': {
    reference: 'Reference',
    alignStyle: 'Align style',
    referenceAction: 'Reference',
    failed: 'Failed',
    sendFailedDetail: 'Send failed: {error}',
    sendFailedDesktop: 'Send failed. Make sure the desktop app is open.',
    inTrash: 'In trash',
    inTrashToast: 'This image is in the app trash. Restore it or empty the trash before sending it again.',
    duplicate: 'Already added',
    duplicateToast: 'This image is already in the current project.',
    success: 'Sent',
    successToast: 'Image sent to Storybook Co-Editor.',
    send: 'Send',
    setAsReference: 'Reference set',
    preparing: 'Preparing...',
    filled: 'Filled',
    filledToast: 'The prompt and images were added to the conversation. Review them before sending.',
    textFilled: 'Text filled',
    textFilledToast: 'The prompt was added. Upload the reference image first, then the target image.',
    copied: 'Copied',
    copiedToast: 'The prompt was copied. Paste it into the conversation and upload both images.',
    operationFailed: 'Operation failed. Try again.',
    extracting: 'Extracting...',
    sending: 'Sending...',
    stylePrompt: `Compare the following two images carefully.

Image 1 is the reference image and style baseline. Image 2 is the target image to adjust.

Complete these tasks:
1. Analyze the specific differences between Image 2 and Image 1 in brushwork, color and temperature, lighting and atmosphere, line quality, material texture, and overall visual style.
2. Based on the analysis, write a precise image-generation prompt that:
   - Fully preserves the composition, subjects, and narrative scene of Image 2.
   - Aligns the visual style of Image 2 with Image 1.
   - Is specific and detailed enough to use directly for image generation.
3. Use the prompt to regenerate Image 2 directly.`,
  },
} as const;

type ExtensionLanguage = keyof typeof messages;
type MessageKey = keyof (typeof messages)['en-US'];

function detectLanguage(): ExtensionLanguage {
  const language = chrome.i18n?.getUILanguage?.() || navigator.language;
  return language.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN';
}

export function tr(key: MessageKey, replacements?: Record<string, string | number>): string {
  let value: string = messages[detectLanguage()][key];
  Object.entries(replacements || {}).forEach(([name, replacement]) => {
    value = value.replaceAll(`{${name}}`, String(replacement));
  });
  return value;
}
