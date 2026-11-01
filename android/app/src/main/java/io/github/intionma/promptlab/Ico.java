package io.github.intionma.promptlab;

import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.RectF;
import android.graphics.drawable.Drawable;

/**
 * 크롬 모양 아이콘을 코드로 그린다(24 단위 격자 · 선 굵기 2).
 * 왜: 글자 기호(←↻⋮🎯)는 폰마다 글꼴이 달라 모양·굵기가 들쭉날쭉했고 색을 못 바꿨다(이모지).
 *     그림 파일을 늘리지 않고 크롬처럼 같은 굵기·같은 색의 선 아이콘을 쓰려고 직접 그린다.
 */
final class Ico extends Drawable {
    static final int BACK = 1, FWD = 2, REFRESH = 3, CLOSE = 4, MORE = 5, STAR = 6, STAR_ON = 7, INFO = 8, LOCK = 9,
            TUNE = 10, WARN = 11, SEARCH = 12, GLOBE = 13, CLOCK = 14, PLUS = 15, TARGET = 16, TARGET_ON = 17, SHARE = 18,
            UP = 19, DOWN = 20, NEWTAB = 21, GRID = 22, EXPAND = 23, SPLIT = 24, DESKTOP = 25, COPY = 26, BOOKMARKS = 27,
            BAR_BOTTOM = 28, TRASH = 29, OPEN_OUT = 30, CHECK = 31, COLLAPSE = 32, HOME = 33;

    final int type;
    final Paint st = new Paint(Paint.ANTI_ALIAS_FLAG), fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    final int sizePx;

    Ico(int type, int color, int sizePx) {
        this.type = type; this.sizePx = sizePx;
        st.setStyle(Paint.Style.STROKE);
        st.setStrokeCap(Paint.Cap.ROUND);
        st.setStrokeJoin(Paint.Join.ROUND);
        fill.setStyle(Paint.Style.FILL);
        setColor(color);
    }

    void setColor(int c) { st.setColor(c); fill.setColor(c); invalidateSelf(); }

    @Override public int getIntrinsicWidth() { return sizePx; }
    @Override public int getIntrinsicHeight() { return sizePx; }

    @Override public void draw(Canvas c) {
        android.graphics.Rect b = getBounds();
        float s = Math.min(b.width(), b.height()) / 24f;
        c.save();
        c.translate(b.left + (b.width() - 24 * s) / 2f, b.top + (b.height() - 24 * s) / 2f);
        c.scale(s, s);
        st.setStrokeWidth(2f);
        Path p = new Path();
        switch (type) {
            case BACK: line(c, 19, 12, 5, 12); p.moveTo(11, 6); p.lineTo(5, 12); p.lineTo(11, 18); c.drawPath(p, st); break;
            case FWD: line(c, 5, 12, 19, 12); p.moveTo(13, 6); p.lineTo(19, 12); p.lineTo(13, 18); c.drawPath(p, st); break;
            case HOME: p.moveTo(4, 11); p.lineTo(12, 4); p.lineTo(20, 11); c.drawPath(p, st); p.reset();
                p.moveTo(6, 10); p.lineTo(6, 20); p.lineTo(18, 20); p.lineTo(18, 10); c.drawPath(p, st); break;
            case REFRESH: {
                c.drawArc(new RectF(5, 5, 19, 19), -40, 300, false, st);
                p.moveTo(19.5f, 3.5f); p.lineTo(19.5f, 8.5f); p.lineTo(14.5f, 8.5f); c.drawPath(p, st); break;
            }
            case CLOSE: line(c, 6, 6, 18, 18); line(c, 18, 6, 6, 18); break;
            case MORE: c.drawCircle(12, 5, 2, fill); c.drawCircle(12, 12, 2, fill); c.drawCircle(12, 19, 2, fill); break;
            case STAR: case STAR_ON: {
                for (int i = 0; i < 10; i++) {
                    double a = Math.PI / 2 + i * Math.PI / 5; float r = (i % 2 == 0) ? 9.5f : 4.2f;
                    float x = 12 + (float) (r * Math.cos(a)), y = 12.8f - (float) (r * Math.sin(a));
                    if (i == 0) p.moveTo(x, y); else p.lineTo(x, y);
                }
                p.close(); c.drawPath(p, type == STAR_ON ? fill : st); break;
            }
            case INFO: c.drawCircle(12, 12, 9, st); line(c, 12, 11, 12, 16.5f); c.drawCircle(12, 7.6f, 1.3f, fill); break;
            case LOCK: c.drawRoundRect(new RectF(6, 11, 18, 20), 2, 2, st); c.drawArc(new RectF(8.5f, 4.5f, 15.5f, 13.5f), 180, 180, false, st); line(c, 8.5f, 9, 8.5f, 11); line(c, 15.5f, 9, 15.5f, 11); break;
            case TUNE: line(c, 4, 8, 20, 8); line(c, 4, 16, 20, 16); c.drawCircle(9, 8, 2.6f, fill); c.drawCircle(15, 16, 2.6f, fill); break;
            case WARN: p.moveTo(12, 4); p.lineTo(21, 19.5f); p.lineTo(3, 19.5f); p.close(); c.drawPath(p, st); line(c, 12, 10, 12, 14); c.drawCircle(12, 17, 1.2f, fill); break;
            case SEARCH: c.drawCircle(10.5f, 10.5f, 6, st); line(c, 15, 15, 20, 20); break;
            case GLOBE: c.drawCircle(12, 12, 9, st); c.drawOval(new RectF(8, 3, 16, 21), st); line(c, 3, 12, 21, 12); break;
            case CLOCK: c.drawCircle(12, 12, 9, st); line(c, 12, 7, 12, 12); line(c, 12, 12, 15.5f, 14); break;
            case PLUS: line(c, 12, 5, 12, 19); line(c, 5, 12, 19, 12); break;
            case TARGET: case TARGET_ON: c.drawCircle(12, 12, 8.5f, st); c.drawCircle(12, 12, 4.5f, st); c.drawCircle(12, 12, 1.6f, fill);
                if (type == TARGET_ON) { line(c, 12, 1.5f, 12, 4); line(c, 12, 20, 12, 22.5f); line(c, 1.5f, 12, 4, 12); line(c, 20, 12, 22.5f, 12); } break;
            case SHARE: c.drawCircle(17, 5.5f, 2.5f, st); c.drawCircle(6.5f, 12, 2.5f, st); c.drawCircle(17, 18.5f, 2.5f, st); line(c, 8.7f, 10.8f, 14.8f, 6.8f); line(c, 8.7f, 13.2f, 14.8f, 17.2f); break;
            case UP: p.moveTo(6, 15); p.lineTo(12, 9); p.lineTo(18, 15); c.drawPath(p, st); break;
            case DOWN: p.moveTo(6, 9); p.lineTo(12, 15); p.lineTo(18, 9); c.drawPath(p, st); break;
            case NEWTAB: c.drawRoundRect(new RectF(4, 4, 20, 20), 3, 3, st); line(c, 12, 8.5f, 12, 15.5f); line(c, 8.5f, 12, 15.5f, 12); break;
            case GRID: c.drawRoundRect(new RectF(4, 4, 11, 11), 1.5f, 1.5f, st); c.drawRoundRect(new RectF(13, 4, 20, 11), 1.5f, 1.5f, st);
                c.drawRoundRect(new RectF(4, 13, 11, 20), 1.5f, 1.5f, st); c.drawRoundRect(new RectF(13, 13, 20, 20), 1.5f, 1.5f, st); break;
            case EXPAND: p.moveTo(4, 9); p.lineTo(4, 4); p.lineTo(9, 4); p.moveTo(15, 4); p.lineTo(20, 4); p.lineTo(20, 9);
                p.moveTo(20, 15); p.lineTo(20, 20); p.lineTo(15, 20); p.moveTo(9, 20); p.lineTo(4, 20); p.lineTo(4, 15); c.drawPath(p, st); break;
            case COLLAPSE: p.moveTo(9, 4); p.lineTo(9, 9); p.lineTo(4, 9); p.moveTo(15, 4); p.lineTo(15, 9); p.lineTo(20, 9);
                p.moveTo(20, 15); p.lineTo(15, 15); p.lineTo(15, 20); p.moveTo(4, 15); p.lineTo(9, 15); p.lineTo(9, 20); c.drawPath(p, st); break;
            case SPLIT: c.drawRoundRect(new RectF(3, 5, 21, 19), 2, 2, st); line(c, 12, 5, 12, 19); break;
            case DESKTOP: c.drawRoundRect(new RectF(3, 4, 21, 16), 1.5f, 1.5f, st); line(c, 12, 16, 12, 20); line(c, 8, 20, 16, 20); break;
            case COPY: c.drawRoundRect(new RectF(8, 8, 20, 20), 2, 2, st); p.moveTo(5, 16); p.lineTo(4, 16); p.lineTo(4, 4); p.lineTo(16, 4); p.lineTo(16, 5); c.drawPath(p, st); break;
            case BOOKMARKS: p.moveTo(6, 3.5f); p.lineTo(18, 3.5f); p.lineTo(18, 20.5f); p.lineTo(12, 16.5f); p.lineTo(6, 20.5f); p.close(); c.drawPath(p, st); break;
            case BAR_BOTTOM: c.drawRoundRect(new RectF(4, 3, 20, 21), 2, 2, st); line(c, 4, 16, 20, 16); break;
            case TRASH: line(c, 4, 6.5f, 20, 6.5f); p.moveTo(6.5f, 6.5f); p.lineTo(7.5f, 20); p.lineTo(16.5f, 20); p.lineTo(17.5f, 6.5f); c.drawPath(p, st); line(c, 9.5f, 3.5f, 14.5f, 3.5f); break;
            case OPEN_OUT: p.moveTo(18, 13); p.lineTo(18, 20); p.lineTo(4, 20); p.lineTo(4, 6); p.lineTo(11, 6); c.drawPath(p, st); line(c, 14, 4, 20, 4); line(c, 20, 4, 20, 10); line(c, 20, 4, 11, 13); break;
            case CHECK: p.moveTo(5, 12.5f); p.lineTo(10, 17.5f); p.lineTo(19, 7); c.drawPath(p, st); break;
        }
        c.restore();
    }

    void line(Canvas c, float x1, float y1, float x2, float y2) { c.drawLine(x1, y1, x2, y2, st); }

    @Override public void setAlpha(int a) { st.setAlpha(a); fill.setAlpha(a); }
    @Override public void setColorFilter(ColorFilter cf) { st.setColorFilter(cf); fill.setColorFilter(cf); }
    @Override public int getOpacity() { return PixelFormat.TRANSLUCENT; }
}
