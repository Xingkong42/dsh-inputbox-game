"""
生成插件市场用的位图图标（assets/icon-180.png）。

市场条目里的 icon 必须是 GitHub 托管的**位图**（png/jpg/webp），SVG 会被拒，
所以这里用 Pillow 按 icon.svg 的造型重画一张 180×180 的 PNG。
"""
from PIL import Image, ImageDraw

SIZE = 180
SCALE = SIZE / 64

BG = (16, 36, 58, 255)
SNAKE = (77, 157, 255, 255)
EYE = (234, 243, 255, 255)
FOOD = (245, 166, 35, 255)


def cubic(p0, p1, p2, p3, steps=48):
    points = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        x = u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0]
        y = u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]
        points.append((x, y))
    return points


# icon.svg 里的路径：M16 47 c11 0 11-15 19-15 s10 7 15 7
path = cubic((16, 47), (27, 47), (27, 32), (35, 32))
path += cubic((35, 32), (43, 32), (45, 39), (50, 39))[1:]
scaled = [(x * SCALE, y * SCALE) for x, y in path]

image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)

# 圆角底板
draw.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=int(14 * SCALE), fill=BG)

# 蛇身（粗线 + 圆角接头）
draw.line(scaled, fill=SNAKE, width=int(10 * SCALE), joint="curve")
radius = 5 * SCALE
for x, y in scaled:
    draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill=SNAKE)

# 头部的眼睛
eye_x, eye_y = 45 * SCALE, 38 * SCALE
eye_r = 3.4 * SCALE
draw.ellipse([eye_x - eye_r, eye_y - eye_r, eye_x + eye_r, eye_y + eye_r], fill=EYE)

# 食物
food_x, food_y = 16 * SCALE, 20 * SCALE
food_r = 5.2 * SCALE
draw.ellipse([food_x - food_r, food_y - food_r, food_x + food_r, food_y + food_r], fill=FOOD)

image.save("assets/icon-180.png")
print("assets/icon-180.png 已生成")
