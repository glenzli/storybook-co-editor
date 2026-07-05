import notoSansScLicense from '../assets/fonts/google/OFL-Noto-Sans-SC.txt?raw';
import notoSerifScLicense from '../assets/fonts/google/OFL-Noto-Serif-SC.txt?raw';
import zcoolKuaiLeLicense from '../assets/fonts/google/OFL-ZCOOL-KuaiLe.txt?raw';
import lxgwWenKaiLicense from '../assets/fonts/lxgw/OFL-LXGW-WenKai.txt?raw';
import smileySansLicense from '../assets/fonts/display/OFL-Smiley-Sans.txt?raw';
import zcoolQingKeHuangYouLicense from '../assets/fonts/display/OFL-ZCOOL-QingKe-HuangYou.txt?raw';
import zcoolXiaoWeiLicense from '../assets/fonts/display/OFL-ZCOOL-XiaoWei.txt?raw';

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
  note: '应用本体许可证文本随发行包提供；第三方字体按各自许可证分发。',
} as const;

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
