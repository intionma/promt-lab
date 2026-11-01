package io.github.intionma.promptlab;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.GestureDetector;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;

/**
 * [둘러보기(브라우저) | 프롬프트 랩] 화면 나누기 — v1.2 (사용자 요청).
 *
 *  mode 0 = 랩만 (브라우저 닫힘) · 1 = 반반(경계선을 끌어 비율 조절) · 2 = 브라우저 크게
 *  · 폭이 600dp 이상이면 옆으로(폴드 펼침·겉화면 가로), 좁으면 위아래로 나눈다.
 *    ⚠ 이건 '들어가느냐'만 보는 것이다 — 어느 쪽에 둘지·비율·크게 볼지는 전부 사용자가 고른다(CLAUDE.md '화면 크기로 의도를 맞히지 말 것').
 *  · ⚠ '브라우저 크게'에서도 랩을 숨기지(GONE) 않고 **뒤에 깔아 둔다.** 숨기면 웹앱이 '안 보임'이 되어 타이머가 느려지고
 *    (대기열·결과 받기) 보이지 않음 처리(visibilitychange)가 돈다. 덮여 있을 뿐 살아 있게 한다.
 *  · 자식 순서: [0]=랩 자리 [1]=경계선 [2]=브라우저 — 나중 것이 위에 그려진다.
 */
final class SplitLayout extends ViewGroup {

    interface Listener {
        void onRatio(float r, boolean done);
        /** 경계선을 한 번 탭 — 나누기 방향·자리를 고르는 메뉴(사용자 요청: "상하/좌우를 고르고 자리도 바꾸게"). */
        default void onDividerTap(View anchor, float rawX, float rawY) { }
    }

    final View lab, browser;
    final Divider divider;
    int mode = 0;
    float ratio = 0.5f;            // 브라우저가 차지하는 몫
    boolean browserFirst = true;   // 브라우저가 왼쪽(위)
    int dir = 0;                   // 나누기 방향 — 0 자동(폭 600dp 이상이면 좌우) · 1 늘 좌우 · 2 늘 위아래 (사용자가 고른다)
    Listener listener;
    final float dp;

    SplitLayout(Context c, View lab, View browser) {
        super(c);
        this.lab = lab;
        this.browser = browser;
        dp = c.getResources().getDisplayMetrics().density;
        divider = new Divider(c);
        addView(lab);
        addView(divider);
        addView(browser);
        apply();
    }

    boolean sideBySide(int w) { return dir == 1 || (dir == 0 && w >= 600 * dp); }

    void setMode(int m) { mode = m; apply(); requestLayout(); }
    void setRatio(float r) { ratio = clamp(r); requestLayout(); }
    static float clamp(float r) { return Math.max(0.2f, Math.min(0.8f, r)); }

    void apply() {
        browser.setVisibility(mode == 0 ? GONE : VISIBLE);
        divider.setVisibility(mode == 1 ? VISIBLE : GONE);
    }

    int divPx() { return Math.round(18 * dp); }

    @Override protected void onMeasure(int ws, int hs) {
        int w = MeasureSpec.getSize(ws), h = MeasureSpec.getSize(hs);
        setMeasuredDimension(w, h);
        int[] r = rects(w, h);
        measureTo(lab, r[0], r[1], r[2], r[3]);
        if (mode == 1) measureTo(divider, r[4], r[5], r[6], r[7]);
        if (mode != 0) measureTo(browser, r[8], r[9], r[10], r[11]);
    }

    static void measureTo(View v, int l, int t, int rr, int b) {
        v.measure(MeasureSpec.makeMeasureSpec(Math.max(0, rr - l), MeasureSpec.EXACTLY),
                  MeasureSpec.makeMeasureSpec(Math.max(0, b - t), MeasureSpec.EXACTLY));
    }

    @Override protected void onLayout(boolean changed, int l, int t, int rr, int b) {
        int[] r = rects(rr - l, b - t);
        lab.layout(r[0], r[1], r[2], r[3]);
        if (mode == 1) divider.layout(r[4], r[5], r[6], r[7]);
        if (mode != 0) browser.layout(r[8], r[9], r[10], r[11]);
    }

    /** [랩 l,t,r,b][경계선 l,t,r,b][브라우저 l,t,r,b] */
    int[] rects(int w, int h) {
        int[] o = new int[12];
        if (mode != 1) {
            //  랩만 · 브라우저 크게 — 둘 다 화면 전체(크게일 땐 브라우저가 랩을 덮는다)
            o[2] = w; o[3] = h; o[10] = w; o[11] = h;
            divider.vertical = sideBySide(w);
            return o;
        }
        boolean side = sideBySide(w);
        divider.vertical = side;
        int D = divPx();
        int total = (side ? w : h) - D;
        int bsz = Math.round(total * ratio), lsz = total - bsz;
        int a0 = 0, a1 = browserFirst ? bsz : lsz;           // 첫 칸
        int d0 = a1, d1 = a1 + D;                            // 경계선
        int c0 = d1, c1 = d1 + (browserFirst ? lsz : bsz);   // 둘째 칸
        int[] first = side ? new int[]{a0, 0, a1, h} : new int[]{0, a0, w, a1};
        int[] div = side ? new int[]{d0, 0, d1, h} : new int[]{0, d0, w, d1};
        int[] second = side ? new int[]{c0, 0, c1, h} : new int[]{0, c0, w, c1};
        int[] br = browserFirst ? first : second, lb = browserFirst ? second : first;
        System.arraycopy(lb, 0, o, 0, 4);
        System.arraycopy(div, 0, o, 4, 4);
        System.arraycopy(br, 0, o, 8, 4);
        return o;
    }

    /** 끌어서 비율을 바꾸는 막대. 두 번 탭하면 반반. */
    final class Divider extends View {
        boolean vertical = true;
        final Paint bar = new Paint(Paint.ANTI_ALIAS_FLAG), pill = new Paint(Paint.ANTI_ALIAS_FLAG);
        boolean dragging;
        long lastApply;
        final GestureDetector gd;

        Divider(Context c) {
            super(c);
            setContentDescription("화면 나누기 경계 — 끌어서 크기 조절, 한 번 탭하면 나누기 방식, 두 번 탭하면 반반");
            setTheme(false);
            gd = new GestureDetector(c, new GestureDetector.SimpleOnGestureListener() {
                @Override public boolean onSingleTapConfirmed(MotionEvent e) {
                    if (listener != null) listener.onDividerTap(Divider.this, e.getRawX(), e.getRawY());
                    return true;
                }
                @Override public boolean onDoubleTap(MotionEvent e) {
                    ratio = 0.5f; requestLayoutAll(); if (listener != null) listener.onRatio(ratio, true); return true;
                }
            });
        }

        void setTheme(boolean light) {
            setBackgroundColor(light ? Color.parseColor("#dfe3ea") : Color.parseColor("#0a0d13"));
            bar.setColor(light ? Color.parseColor("#c3c9d4") : Color.parseColor("#1c2230"));
            pill.setColor(light ? Color.parseColor("#7c8494") : Color.parseColor("#5b6478"));
            invalidate();
        }

        @Override protected void onDraw(Canvas c) {
            float w = getWidth(), h = getHeight();
            if (vertical) {
                c.drawRect(w / 2 - dp, 0, w / 2 + dp, h, bar);
                float ph = 44 * dp, pw = 5 * dp;
                c.drawRoundRect(new RectF(w / 2 - pw / 2, h / 2 - ph / 2, w / 2 + pw / 2, h / 2 + ph / 2), pw, pw, pill);
            } else {
                c.drawRect(0, h / 2 - dp, w, h / 2 + dp, bar);
                float pw = 44 * dp, ph = 5 * dp;
                c.drawRoundRect(new RectF(w / 2 - pw / 2, h / 2 - ph / 2, w / 2 + pw / 2, h / 2 + ph / 2), ph, ph, pill);
            }
        }

        @Override public boolean onTouchEvent(MotionEvent e) {
            gd.onTouchEvent(e);
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    dragging = true; pill.setAlpha(255); invalidate();
                    getParent().requestDisallowInterceptTouchEvent(true);
                    return true;
                case MotionEvent.ACTION_MOVE: {
                    int[] loc = new int[2];
                    SplitLayout.this.getLocationOnScreen(loc);
                    float pos = vertical ? e.getRawX() - loc[0] : e.getRawY() - loc[1];
                    float total = (vertical ? SplitLayout.this.getWidth() : SplitLayout.this.getHeight()) - divPx();
                    if (total <= 0) return true;
                    float first = (pos - divPx() / 2f) / total;
                    ratio = clamp(browserFirst ? first : 1 - first);
                    //  ⚠ 끌 때마다 웹앱이 다시 배치된다(무겁다) → 60ms 에 한 번만
                    long now = System.currentTimeMillis();
                    if (now - lastApply > 60) { lastApply = now; requestLayoutAll(); }
                    return true;
                }
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    dragging = false; invalidate();
                    requestLayoutAll();
                    if (listener != null) listener.onRatio(ratio, true);
                    return true;
            }
            return true;
        }

        void requestLayoutAll() { SplitLayout.this.requestLayout(); }
    }
}
