// ③ 민석 — 기기 이전자 (내보내기 → 새 기기 → 불러오기 딱 한 번. 실패하면 전부 잃는다)
const L = require('./lib');

module.exports = async function (browser, port) {
    const R = L.reporter('③ 민석 — 기기 이전 (백업 → 새 기기 → 복구)');
    const { ctx, page, errs } = await L.boot(browser, {
        port, device: L.PC, pre: { pl_layout: 'classic', adult_optin_v1: '1' },
    });
    await page.waitForFunction(() => !!document.getElementById('chip-container-1'), null, { timeout: 20000 });
    await page.waitForTimeout(1500);

    // ── 헌 폰: 1년치 자료를 만든다
    const backup = await page.evaluate(() => {
        window.showToast = () => {};
        const seed = {
            'anima_settings_v1': JSON.stringify({ prompt: 'ANIMA_MARK', steps: 7 }),
            'comfy_lora_presets_v1': JSON.stringify([{ name: 'MY.safetensors', label: 'LORA_MARK', trigger: 'trg', strength: 0.77 }]),
            'comfy_settings_transform_v1': JSON.stringify({ url: 'http://TRANSFORM_MARK:8188' }),
            'comfy_settings_inpaint_v1': JSON.stringify({ url: 'http://INPAINT_MARK:8188' }),
            'comfy_ckpt_names_v1': JSON.stringify(['CKPT_MARK.safetensors']),
            'comfy_lora_names_v1': JSON.stringify(['LORAFILE_MARK.safetensors']),
            'comfy_gallery_urls_v1': JSON.stringify(['http://GALLERY_MARK/view']),
            'pack_combo_deleted_v1': JSON.stringify(['pack_COMBO_MARK']),
            'combo_defaults_v1': JSON.stringify({ MARK: 'COMBODEF_MARK' }),
            'pl_layout': 'studio',
            'adult_optin_v1': '1',
            'pro_prompt_theme': 'light',
            'pro_generation_memo': 'MEMO_MARK',
        };
        Object.entries(seed).forEach(([k, v]) => localStorage.setItem(k, v));
        // 직접 만든 태그 · 한글 별명 · 즐겨찾기 · 프리셋 · 에디터 내용
        try { if (!promptDB[3]) promptDB[3] = {}; promptDB[3]['__내폴더__'] = [{ t: 'DBTAG_MARK', k: 'DB표식' }]; saveDB(); } catch (e) {}
        try { customKorMap['DBTAG_MARK'] = 'KORMAP_MARK'; } catch (e) {}
        try { favorites.push('DBTAG_MARK'); } catch (e) {}
        try { userPresets['PRESET_MARK'] = { layers: ['PSET_MARK', '', '', '', '', '', ''] }; } catch (e) {}
        document.getElementById('layer-3').value = 'EDITOR_MARK';
        syncFromManualInput(3, true);
        try { saveTabsAndStates(); } catch (e) {}
        try { saveComboFS(); } catch (e) {}
        openIOModal('export');
        return document.getElementById('io-textarea').value;
    });

    const MARKS = ['ANIMA_MARK', 'LORA_MARK', 'TRANSFORM_MARK', 'INPAINT_MARK', 'CKPT_MARK', 'LORAFILE_MARK',
        'GALLERY_MARK', 'COMBO_MARK', 'COMBODEF_MARK', 'MEMO_MARK', 'DBTAG_MARK', 'KORMAP_MARK', 'PRESET_MARK', 'EDITOR_MARK'];
    const missing = MARKS.filter(m => backup.indexOf(m) < 0);
    R.ck('백업 파일에 14개 영역이 전부 담긴다', missing.length === 0, '빠짐: ' + missing.join(', '));
    R.note('백업 크기 ' + Math.round(backup.length / 1024) + 'KB');

    // ── 새 폰: 저장소가 완전히 빈 상태에서 불러오기
    const ctx2 = await browser.newContext(L.PC);
    const page2 = await ctx2.newPage();
    const errs2 = []; page2.on('pageerror', e => errs2.push(e.message));
    await page2.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
    await page2.waitForFunction(() => !!document.getElementById('chip-container-1'), null, { timeout: 20000 });
    await page2.waitForTimeout(1500);

    //  새로 깐 앱은 부팅하면서 기본값 몇 개를 스스로 쓴다 — '남의 자료가 없다'로 확인한다
    const empty = await page2.evaluate(() => {
        const keys = Object.keys(localStorage);
        const 남의것 = keys.filter(k => /ANIMA_MARK|MARK/.test(localStorage.getItem(k) || ''));
        return { keys, 남의것 };
    });
    //  복구는 마지막에 앱을 스스로 새로고침한다(정상 동작) → 그 새로고침이 끝난 뒤에 확인한다
    await page2.evaluate((bk) => {
        window.showToast = () => {}; window.confirm = () => true; window.alert = () => {};
        openIOModal('import');
        document.getElementById('io-textarea').value = bk;
        executeIO();
    }, backup);
    await page2.waitForTimeout(3500);
    await page2.waitForFunction(() => !!document.body.getAttribute('data-layout'), null, { timeout: 20000 }).catch(() => {});
    await page2.waitForTimeout(1500);
    const after = await page2.evaluate(() => {
        const g = k => localStorage.getItem(k) || '';
        return {
            Anima: g('anima_settings_v1'), LoRA칩: g('comfy_lora_presets_v1'),
            이미지변환: g('comfy_settings_transform_v1'), 인페인팅: g('comfy_settings_inpaint_v1'),
            체크포인트: g('comfy_ckpt_names_v1'), LoRA파일: g('comfy_lora_names_v1'),
            갤러리: g('comfy_gallery_urls_v1'), 지운조합: g('pack_combo_deleted_v1'),
            조합기본값: g('combo_defaults_v1'), 화면: g('pl_layout'), 성인: g('adult_optin_v1'),
            테마: g('pro_prompt_theme'), 메모: g('pro_generation_memo'),
            내태그: JSON.stringify(((typeof promptDB !== 'undefined' && promptDB[3] && promptDB[3]['__내폴더__']) || []).map(d => d.t)),
            한글별명: JSON.stringify(typeof customKorMap !== 'undefined' ? customKorMap['DBTAG_MARK'] : null),
            즐겨찾기: JSON.stringify(typeof favorites !== 'undefined' ? favorites.indexOf('DBTAG_MARK') >= 0 : null),
            프리셋: JSON.stringify(typeof userPresets !== 'undefined' ? Object.keys(userPresets) : []),
            에디터: g('context_states_v1'),
        };
    });

    const PAIRS = [
        ['Anima 설정', 'Anima', 'ANIMA_MARK'], ['LoRA 칩', 'LoRA칩', 'LORA_MARK'],
        ['이미지변환 설정', '이미지변환', 'TRANSFORM_MARK'], ['인페인팅 설정', '인페인팅', 'INPAINT_MARK'],
        ['체크포인트 목록', '체크포인트', 'CKPT_MARK'], ['LoRA 파일 목록', 'LoRA파일', 'LORAFILE_MARK'],
        ['결과 갤러리 주소', '갤러리', 'GALLERY_MARK'], ['지운 조합 기억', '지운조합', 'COMBO_MARK'],
        ['조합 기본값', '조합기본값', 'COMBODEF_MARK'], ['메모', '메모', 'MEMO_MARK'],
        ['직접 만든 태그', '내태그', 'DBTAG_MARK'], ['한글 별명', '한글별명', 'KORMAP_MARK'],
        ['프리셋', '프리셋', 'PRESET_MARK'], ['에디터 내용', '에디터', 'EDITOR_MARK'],
    ];
    R.ck('새 기기에 남의 자료가 없다', empty.남의것.length === 0, empty.남의것.join(', '));
    R.note('새 기기 초기 키: ' + (empty.keys.join(', ') || '(없음)'));
    PAIRS.forEach(([label, key, mark]) => {
        R.ck(label + ' 복구', (after[key] || '').indexOf(mark) >= 0, '값=' + String(after[key]).slice(0, 60));
    });
    R.ck('마지막 쓰던 화면 복구', after.화면 === 'studio', after.화면);
    R.ck('성인 설정 복구', after.성인 === '1', after.성인);
    R.ck('테마 복구', after.테마 === 'light', after.테마);
    R.ck('즐겨찾기 복구', after.즐겨찾기 === 'true', after.즐겨찾기);

    // ── 복구 뒤 새로고침해도 살아 있는가 (진짜 저장됐는지)
    await page2.reload({ waitUntil: 'load' });
    await page2.waitForTimeout(2500);
    const persist = await page2.evaluate(() => ({
        Anima: localStorage.getItem('anima_settings_v1') || '',
        내태그: ((typeof promptDB !== 'undefined' && promptDB[3] && promptDB[3]['__내폴더__']) || []).some(d => d.t === 'DBTAG_MARK'),
        화면: document.body.getAttribute('data-layout'),
    }));
    R.ck('새로고침 뒤에도 남아 있다', persist.Anima.indexOf('ANIMA_MARK') >= 0 && persist.내태그 === true, JSON.stringify(persist).slice(0, 120));
    R.ck('복구한 화면(스튜디오)으로 뜬다', persist.화면 === 'studio', String(persist.화면));

    const re = L.realErrs(errs.concat(errs2));
    R.ck('오류 없음', re.length === 0, re.slice(0, 3).join(' | '));
    await ctx.close(); await ctx2.close();
    return R;
};
