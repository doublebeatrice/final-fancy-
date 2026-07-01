from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


OUT = Path(r"D:\ad-ops-workbench\outputs\codex_sales_skill_pack\sales_skill_install_card.png")
FONT = r"C:\Windows\Fonts\msyh.ttc"
BOLD = r"C:\Windows\Fonts\msyhbd.ttc"


def font(size, bold=False):
    return ImageFont.truetype(BOLD if bold else FONT, size)


def main():
    w, h = 1600, 900
    img = Image.new("RGB", (w, h), "#F6F8FB")
    d = ImageDraw.Draw(img)

    d.rounded_rectangle([70, 70, 1530, 830], radius=40, fill="#FFFFFF", outline="#D7DEE9", width=2)
    d.text((120, 125), "Amazon 销售技能包", fill="#0F172A", font=font(54, True))
    d.text((120, 200), "让刚装好的 Codex 先懂销售最大公约数，开箱从“只读当前页面”开始。", fill="#64748B", font=font(28))

    d.rounded_rectangle([1120, 120, 1450, 190], radius=18, fill="#111827")
    d.text((1160, 138), "amazon-sales-starter", fill="#FFFFFF", font=font(24, True))

    steps = [
        ("1", "安装公司版 Codex", "按企业微信《Codex安装&使用教程》完成安装。", "#2563EB"),
        ("2", "拿到技能包文件夹", "文件夹名：amazon-sales-starter。", "#F97316"),
        ("3", "放进 skills 目录", "常见路径：C:\\Users\\<用户名>\\.codex\\skills\\", "#059669"),
        ("4", "打开页面说一句", "先识别页面、列字段，不要猜数据。", "#7C3AED"),
    ]
    for i, (num, title, body, color) in enumerate(steps):
        x = 130 + (i % 2) * 690
        y = 300 + (i // 2) * 190
        d.rounded_rectangle([x, y, x + 610, y + 125], radius=24, fill="#F8FAFC", outline="#D7DEE9", width=2)
        d.ellipse([x + 34, y + 34, x + 92, y + 92], fill=color)
        bbox = d.textbbox((0, 0), num, font=font(28, True))
        d.text((x + 63 - (bbox[2] - bbox[0]) / 2, y + 48), num, fill="#FFFFFF", font=font(28, True))
        d.text((x + 120, y + 28), title, fill="#0F172A", font=font(28, True))
        d.text((x + 120, y + 74), body, fill="#64748B", font=font(21))

    d.rounded_rectangle([180, 705, 1420, 770], radius=20, fill="#111827")
    d.text((230, 722), "第一句测试：识别页面类型、列可见字段，不要猜数据，每个判断写依据字段。", fill="#FFFFFF", font=font(25, True))
    d.text((505, 795), "卡住不用硬扛，找助理远程协助安装。", fill="#64748B", font=font(22))

    img.save(OUT)
    print(OUT)


if __name__ == "__main__":
    main()
