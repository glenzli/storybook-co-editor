import notoSansScLicense from '../assets/fonts/google/OFL-Noto-Sans-SC.txt?raw';
import notoSerifScLicense from '../assets/fonts/google/OFL-Noto-Serif-SC.txt?raw';
import zcoolKuaiLeLicense from '../assets/fonts/google/OFL-ZCOOL-KuaiLe.txt?raw';
import lxgwWenKaiLicense from '../assets/fonts/lxgw/OFL-LXGW-WenKai.txt?raw';
import yozaiLicense from '../assets/fonts/handwriting/OFL-Yozai.txt?raw';
import xiaolaiLicense from '../assets/fonts/handwriting/OFL-Xiaolai.txt?raw';
import smileySansLicense from '../assets/fonts/display/OFL-Smiley-Sans.txt?raw';
import zcoolQingKeHuangYouLicense from '../assets/fonts/display/OFL-ZCOOL-QingKe-HuangYou.txt?raw';
import zcoolXiaoWeiLicense from '../assets/fonts/display/OFL-ZCOOL-XiaoWei.txt?raw';
import lopdfLicense from '../assets/licenses/lopdf-MIT.txt?raw';
import rmcpLicense from '../assets/licenses/rmcp-Apache-2.0.txt?raw';

export interface FontLicenseNotice {
  id: string;
  name: string;
  label: string;
  license: string;
  sourceUrl: string;
  bundledFiles: string;
  licenseFile: string;
  licenseText: string;
}

export const APP_LICENSE_NOTICE = {
  name: 'Storybook Co-Editor',
  license: 'MIT License',
  licenseFile: 'LICENSE',
  note: '应用本体许可证文本随发行包提供；第三方组件和字体按各自许可证分发。',
} as const;

export const DEPENDENCY_LICENSE_NOTICES: FontLicenseNotice[] = [
  {
    id: 'lopdf',
    name: 'lopdf',
    label: 'lopdf PDF 文档库',
    license: 'Apache License 2.0',
    sourceUrl: 'https://github.com/J-F-Liu/lopdf',
    bundledFiles: '桌面端 Rust 二进制',
    licenseFile: 'app/src/assets/licenses/lopdf-MIT.txt',
    licenseText: lopdfLicense,
  },
  {
    id: 'rmcp',
    name: 'rmcp',
    label: 'Model Context Protocol Rust SDK',
    license: 'MIT License',
    sourceUrl: 'https://github.com/modelcontextprotocol/rust-sdk',
    bundledFiles: '桌面端 Rust 二进制',
    licenseFile: 'app/src/assets/licenses/rmcp-Apache-2.0.txt',
    licenseText: rmcpLicense,
  },
];

export const FONT_LICENSE_NOTICES: FontLicenseNotice[] = [
  {
    id: 'lxgw-wenkai',
    name: 'LXGW WenKai',
    label: '霞鹜文楷',
    license: 'SIL Open Font License 1.1',
    sourceUrl: 'https://github.com/lxgw/LxgwWenKai',
    bundledFiles: 'app/src/assets/fonts/lxgw/',
    licenseFile: 'app/src/assets/fonts/lxgw/OFL-LXGW-WenKai.txt',
    licenseText: lxgwWenKaiLicense,
  },
  {
    id: 'smiley-sans',
    name: 'Smiley Sans',
    label: '得意黑',
    license: 'SIL Open Font License 1.1',
    sourceUrl: 'https://github.com/atelier-anchor/smiley-sans',
    bundledFiles: 'app/src/assets/fonts/display/SmileySans-Oblique.ttf.woff2',
    licenseFile: 'app/src/assets/fonts/display/OFL-Smiley-Sans.txt',
    licenseText: smileySansLicense,
  },
  {
    id: 'yozai',
    name: 'Yozai',
    label: '悠哉字体',
    license: 'SIL Open Font License 1.1',
    sourceUrl: 'https://github.com/lxgw/yozai-font',
    bundledFiles: 'app/src/assets/fonts/handwriting/yozai-light/ and yozai-regular/',
    licenseFile: 'app/src/assets/fonts/handwriting/OFL-Yozai.txt',
    licenseText: yozaiLicense,
  },
  {
    id: 'xiaolai',
    name: 'Xiaolai',
    label: '小赖字体',
    license: 'SIL Open Font License 1.1',
    sourceUrl: 'https://github.com/lxgw/kose-font',
    bundledFiles: 'app/src/assets/fonts/handwriting/xiaolai/',
    licenseFile: 'app/src/assets/fonts/handwriting/OFL-Xiaolai.txt',
    licenseText: xiaolaiLicense,
  },
  {
    id: 'zcool-qingke-huangyou',
    name: 'ZCOOL QingKe HuangYou',
    label: '站酷庆科黄油体',
    license: 'SIL Open Font License 1.1',
    sourceUrl: 'https://github.com/google/fonts/tree/main/ofl/zcoolqingkehuangyou',
    bundledFiles: 'app/src/assets/fonts/display/ZCOOLQingKeHuangYou-Regular.ttf',
    licenseFile: 'app/src/assets/fonts/display/OFL-ZCOOL-QingKe-HuangYou.txt',
    licenseText: zcoolQingKeHuangYouLicense,
  },
  {
    id: 'zcool-xiaowei',
    name: 'ZCOOL XiaoWei',
    label: '站酷小薇体',
    license: 'SIL Open Font License 1.1',
    sourceUrl: 'https://github.com/google/fonts/tree/main/ofl/zcoolxiaowei',
    bundledFiles: 'app/src/assets/fonts/display/ZCOOLXiaoWei-Regular.ttf',
    licenseFile: 'app/src/assets/fonts/display/OFL-ZCOOL-XiaoWei.txt',
    licenseText: zcoolXiaoWeiLicense,
  },
  {
    id: 'zcool-kuaile',
    name: 'ZCOOL KuaiLe',
    label: '站酷快乐体',
    license: 'SIL Open Font License 1.1',
    sourceUrl: 'https://github.com/google/fonts/tree/main/ofl/zcoolkuaile',
    bundledFiles: 'app/src/assets/fonts/google/',
    licenseFile: 'app/src/assets/fonts/google/OFL-ZCOOL-KuaiLe.txt',
    licenseText: zcoolKuaiLeLicense,
  },
  {
    id: 'noto-serif-sc',
    name: 'Noto Serif SC',
    label: '思源宋体 / Noto Serif SC',
    license: 'SIL Open Font License 1.1',
    sourceUrl: 'https://github.com/google/fonts/tree/main/ofl/notoserifsc',
    bundledFiles: 'app/src/assets/fonts/google/',
    licenseFile: 'app/src/assets/fonts/google/OFL-Noto-Serif-SC.txt',
    licenseText: notoSerifScLicense,
  },
  {
    id: 'noto-sans-sc',
    name: 'Noto Sans SC',
    label: '思源黑体 / Noto Sans SC',
    license: 'SIL Open Font License 1.1',
    sourceUrl: 'https://github.com/google/fonts/tree/main/ofl/notosanssc',
    bundledFiles: 'app/src/assets/fonts/google/',
    licenseFile: 'app/src/assets/fonts/google/OFL-Noto-Sans-SC.txt',
    licenseText: notoSansScLicense,
  },
];
