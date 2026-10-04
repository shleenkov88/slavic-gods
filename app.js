(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* высота закреплённой шапки для якорей */
  var nav = $('nav');
  function setNavH() { document.documentElement.style.setProperty('--navh', nav.offsetHeight + 'px'); }
  setNavH();
  window.addEventListener('resize', setNavH);
  if (window.ResizeObserver) new ResizeObserver(setNavH).observe(nav);

  /* раскрывающиеся блоки: на компьютере открыто всё, кроме «Откуда это знаем»; на телефоне всё свёрнуто, вступление видно сразу */
  var mq = window.matchMedia('(min-width: 861px)');
  function syncDetails() { if (mq.matches) $$('details.src:not(.s-refs), details.briefd:not(.closed)').forEach(function (d) { d.open = true; }); }
  syncDetails();
  if (mq.addEventListener) mq.addEventListener('change', syncDetails);
  window.addEventListener('beforeprint', function () { $$('details.src, details.morebox, details.scaled, details.briefd, details.curio, details.fullhow, details.relics').forEach(function (d) { d.open = true; }); });

  /* якорь внутри свёрнутого блока: раскрыть всё, что его закрывает */
  function reveal(raw) {
    var id = raw ? decodeURIComponent(raw.replace(/^#/, '')) : '';
    var el = id ? document.getElementById(id) : null;
    if (!el) return false;
    var changed = false;
    var mb = document.getElementById('morebox');
    if (mb && !mb.open && mb.querySelector('#cat2 a[href="#' + id + '"]')) { mb.open = true; changed = true; }
    for (var n = el; n && n !== document.body; n = n.parentElement) {
      if (n.tagName === 'DETAILS' && !n.open) { n.open = true; changed = true; }
    }
    if (changed) requestAnimationFrame(function () { el.scrollIntoView({ block: 'start', behavior: 'instant' }); });
    return changed;
  }
  window.addEventListener('hashchange', function () { reveal(location.hash); });
  if (location.hash) {
    /* при первой загрузке: раскрыть, встать на место без анимации и поправить после загрузки шрифтов */
    var touched = false;
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (ev) { window.addEventListener(ev, function () { touched = true; }, { passive: true, once: true }); });
    var align = function () {
      if (touched) return;
      var el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (el) el.scrollIntoView({ block: 'start', behavior: 'instant' });
    };
    reveal(location.hash);
    var settle = function () { setTimeout(align, 60); [400, 900, 1600, 2600].forEach(function (d) { setTimeout(function () { var el = document.getElementById(decodeURIComponent(location.hash.slice(1))); if (el && !touched && Math.abs(el.getBoundingClientRect().top - (nav.offsetHeight + 10)) > 30) align(); }, d); }); };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(settle);
    window.addEventListener('load', settle);
  }


  /* переход к якорю с раскрытием закрытых блоков */
  function goTo(id) {
    var el = document.getElementById(id);
    if (!el) return;
    reveal('#' + id);
    markJump(id);
    history.pushState({ sgIdx: ++hIdx }, '', '#' + id);
    el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    try { el.focus({ preventScroll: true }); } catch (e) {}
  }


  /* «Вернуться к чтению»: запоминаем место до перехода по якорю; «Назад» браузера тоже возвращает на него */
  var hIdx = (history.state && history.state.sgIdx) || 0;
  try { history.replaceState(Object.assign({}, history.state, { sgIdx: hIdx }), ''); } catch (e) {}
  var backBtn = $('#backread');
  var ret = null, retTimer = 0, MINY = 200;
  function absTop(el) { return el.getBoundingClientRect().top + window.pageYOffset; }
  function readPos() {
    var th = nav.offsetHeight + 20, best = null, bt = -1e9, hd = null, ht = -1e9, y = window.pageYOffset;
    var all = document.querySelectorAll('[id]');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.namespaceURI !== 'http://www.w3.org/1999/xhtml') continue;
      if (nav.contains(el) || el.classList.contains('music') || el.classList.contains('totop') || el === backBtn) continue;
      var r = el.getBoundingClientRect();
      if (!r.height || r.top > th) continue;
      if (r.top > bt) { bt = r.top; best = el; }
    }
    $$('h2,h3').forEach(function (h) {
      var r = h.getBoundingClientRect();
      if (r.height && r.top <= th && r.top > ht) { ht = r.top; hd = h; }
    });
    return { y: y, a: best ? best.id : '', d: best ? y - absTop(best) : 0, label: hd ? hd.textContent.replace(/\s+/g, ' ').trim().slice(0, 60) : '' };
  }
  function posY(p) {
    var el = p.a ? document.getElementById(p.a) : null;
    return Math.max(0, el && el.getBoundingClientRect().height ? absTop(el) + p.d : p.y);
  }
  function hideBack() {
    clearTimeout(retTimer); ret = null;
    backBtn.classList.remove('show');
    setTimeout(function () { if (!ret) backBtn.hidden = true; }, 250);
  }
  function showBack() {
    backBtn.setAttribute('aria-label', 'Вернуться к чтению' + (ret.label ? ': ' + ret.label : ''));
    backBtn.title = ret.label ? 'Вернуться к месту: ' + ret.label : 'Вернуться к месту чтения';
    backBtn.hidden = false;
    void backBtn.offsetWidth;
    backBtn.classList.add('show');
    clearTimeout(retTimer);
    retTimer = setTimeout(hideBack, 180000);
  }
  /* вызывается до перехода: сохраняем позицию в текущей записи истории и запоминаем место чтения */
  function markJump(id) {
    var p = readPos(), y = p.y;
    try { history.replaceState(Object.assign({}, history.state, { sgIdx: hIdx, sgY: p.y, sgA: p.a, sgD: p.d }), ''); } catch (e) {}
    var te = id === 'top' || !id ? document.body : document.getElementById(id);
    var land = te ? Math.max(0, absTop(te) - nav.offsetHeight - 10) : 0;
    var vh = window.innerHeight;
    if (ret && Math.abs(y - ret.land) < vh * 1.5) { ret.land = land; ret.idx = ret.idx; return; }   /* цепочка переходов: точка чтения остаётся первой */
    if (ret) hideBack();
    if (y < MINY || Math.abs(land - y) < 300) return;
    ret = { y: p.y, a: p.a, d: p.d, label: p.label, land: land, idx: hIdx, left: false };
    showBack();
  }
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || a.target === '_blank') return;
    var h = a.getAttribute('href');
    if (h.length < 2) return;
    var id; try { id = decodeURIComponent(h.slice(1)); } catch (x) { return; }
    if (id !== 'top' && !document.getElementById(id)) return;
    markJump(id);
  }, true);
  window.addEventListener('scroll', function () {
    if (!ret) return;
    var dy = Math.abs(window.pageYOffset - ret.y);
    if (dy > 400) ret.left = true;
    else if (ret.left && dy < 120) hideBack();
  }, { passive: true });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ret && !navEl.classList.contains('open')) { hideBack(); } });
  backBtn.addEventListener('click', function () {
    if (!ret) return;
    var r = ret, n = hIdx - r.idx, target = posY(r);
    hideBack();
    var finish = function () {
      var af = document.getElementById(r.a);
      if (af) { if (!af.hasAttribute('tabindex')) af.setAttribute('tabindex', '-1'); try { af.focus({ preventScroll: true }); } catch (x) {} }
      if (n > 0 && Math.abs(window.pageYOffset - target) < 150) { quiet = target; try { history.go(-n); } catch (x) { quiet = null; } }
    };
    if (reduce) { window.scrollTo({ top: target, behavior: 'auto' }); finish(); return; }
    window.scrollTo({ top: target, behavior: 'smooth' });
    var t0 = Date.now(), iv = setInterval(function () {
      if (Math.abs(window.pageYOffset - target) < 3 || Date.now() - t0 > 1500) { clearInterval(iv); finish(); }
    }, 60);
  });
  var quiet = null;
  window.addEventListener('popstate', function (e) {
    var st = e.state;
    if (!st || st.sgIdx == null) return;   /* обычный якорный переход (не возврат по истории) */
    hIdx = st.sgIdx;
    if (ret) hideBack();
    var tgt = quiet;
    quiet = null;
    if (tgt == null && st && st.sgY != null) tgt = posY({ a: st.sgA, d: st.sgD, y: st.sgY });
    if (tgt == null) return;
    var go = function () { window.scrollTo({ top: tgt, behavior: 'instant' }); };
    go(); requestAnimationFrame(go); setTimeout(go, 120);
  });
  window.addEventListener('hashchange', function () {
    /* новая запись истории от обычной якорной ссылки: нумеруем её */
    if (history.state && history.state.sgIdx != null) return;
    hIdx++;
    try { history.replaceState({ sgIdx: hIdx }, ''); } catch (e) {}
  });

  /* «Все боги» на первом экране: раскрыть и скрытых персонажей */
  $$('[data-openmore]').forEach(function (a) { a.addEventListener('click', function () { var mb = $('#morebox'); if (mb) mb.open = true; }); });

  /* каталог: фильтры и поиск */
  (function () {
    var cat = $('#cat'), chips = $('#chips'), box = $('#chipbox'), cnt = $('#ccount');
    var cards = $$('#cat > li, #cat2 > li'), names = $$('#chips > li');
    var more = $('#morebox'), mcount = $('#morecount');
    var cur = 'all';
    function ok(li, f, isCard) {
      if (f === 'all') return true;
      if (f === 'east' || f === 'west') return (' ' + (li.getAttribute('data-reg') || '') + ' ').indexOf(' ' + f + ' ') > -1;
      return isCard ? +li.getAttribute('data-n-' + f) > 0 : li.getAttribute('data-lv') === f;
    }
    function apply() {
      var a = 0, b = 0;
      cards.forEach(function (li) { var on = ok(li, cur, true); li.hidden = !on; if (on) a++; });
      names.forEach(function (li) { var on = ok(li, cur, false); li.hidden = !on; if (on) b++; });
      box.hidden = b === 0;
      cat.setAttribute('data-f', cur); $('#cat2').setAttribute('data-f', cur);
      var hv = 0;
      $$('#cat2 > li').forEach(function (li) { if (!li.hidden) hv++; });
      names.forEach(function (li) { if (!li.hidden) hv++; });
      mcount.textContent = '(' + hv + ')';
      if (cur !== 'all' && hv > 0 && !more.open) more.open = true;
      cnt.textContent = 'Карточек: ' + a + ' из ' + cards.length + (b ? '. Имён из раздела «Выдумки»: ' + b + ' из ' + names.length : '') + (a === 0 && b === 0 ? '. Ничего не найдено' : '');
    }
    $$('.flt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        cur = btn.getAttribute('data-f');
        $$('.flt').forEach(function (x) { x.setAttribute('aria-pressed', x === btn ? 'true' : 'false'); });
        apply();
      });
    });
    apply();

    var IDX = [{"t":"Перун","k":"Перун Перуна Perun гром молния клятва идол Киев Новгород Волхов Перуня рень топор дуб Перкунас Илья-пророк Перынь палица Иоакимовская летопись Древлянский Парома","h":"#perun","y":"карточка"},{"t":"Велес / Волос","k":"Велес Волос Велеса Волоса Veles скотий бог Власий Святой Власий Велесова книга Боян внук Слово о полку берестяная грамота 914 Подлипчук Успенский Никола Авраамий Ростовский Чудский конец Проложное житие Почайна Милютенко","h":"#veles","y":"карточка"},{"t":"Мокошь","k":"Мокошь Мокоши Макошь Mokosh Параскева Пятница пряха прядение вилы Слово христолюбца Слово Григория Златоуст жена Перуна Посвистач Збручский идол Гальковский","h":"#mokosh","y":"карточка"},{"t":"Дажьбог","k":"Дажьбог Даждьбог Дажьбога Dazhbog Даждь-Бог солнце внуки Слово о полку Малала Гефест Гелиос глосса Дабог Дьеус-Патер Ипатьевская летопись 1114 Гальковский","h":"#dazhbog","y":"карточка"},{"t":"Хорс","k":"Хорс Хоръс Хурс Хорса Khors солнце иранское Хорезм хорезмийцы сарматы аланы лунный бог Пуканец Беседа трёх святителей Хождение Богородицы Херсонес Слово о полку Всеслав Щапов","h":"#khors","y":"карточка"},{"t":"Стрибог","k":"Стрибог Стрибога Stribog ветер ветры внуки Слово о полку Позвизд Посвистач Погода Длугош Переплут Златоуст топонимы Стрибожь Гальковский","h":"#stribog","y":"карточка"},{"t":"Симаргл","k":"Симаргл Семаргл Сэнмурв Симург Simargl Сим Регл Сеимарекла Зимцерла Орбини Гнёздово колты крылатый пёс Рыбаков Тревер Юрьев-Польский","h":"#simargl","y":"карточка"},{"t":"Сварог","k":"Сварог Сварога Svarog Сварожич Сварожица огонь кузнец Гефест Малала Феост Алатырь Титмар Zuarasici Веды Словена Велесова книга Слово христолюбца Златоуст Гальковский","h":"#svarog","y":"карточка"},{"t":"Троян","k":"Троян Трояна Trojan Троянь тропа Трояна Хождение Богородицы по мукам Слово о полку царь Рим","h":"#trojan","y":"карточка"},{"t":"Свентовит","k":"Свентовит Святовит Свантевит Svantevit Svetovid Аркона Рюген руяне руяны Саксон Грамматик Гельмольд Корвей святой Вит белый конь рог меч Збручский идол четыре головы","h":"#svantevit","y":"карточка"},{"t":"Триглав","k":"Триглав Triglav Щецин Штеттин Оттон Бамбергский Эббон Герборд Прюфенинг три головы золотая повязка чёрный конь Троица Ловмянский Гейштор Дында гора Триглав Словения жития Оттона","h":"#triglav","y":"карточка"},{"t":"Сварожич Ретры","k":"Сварожич Ретры Zuarasici Титмар Мерзебургский Ридегост Ридигост Ретра редарии Адам Бременский Редигаст Радегаст Redigast знамя священный конь рога зверей","h":"#svarozhich","y":"карточка"},{"t":"Яровит","k":"Яровит Яровита Gerovitus Герборд Эббон Вольгаст Гавельберг щит Марс Ярило жития Оттона","h":"#yarovit","y":"карточка"},{"t":"Ругевит, Поревит, Поренут","k":"Ругевит Поревит Поренут Rugevit Porevit Porenut Каренца Рюген Саксон Грамматик 1168 семь лиц пять голов","h":"#rugevit","y":"карточка"},{"t":"Прове, Подага, Жива","k":"Прове Prove Подага Жива Siwa Припегала Приап Гельмольд Старград вагры Плуне полабы дубовая роща","h":"#prove","y":"карточка"},{"t":"Чернобог","k":"Чернобог Чернебог Гельмольд чёрный бог злой бог дьявол","h":"#cab-chernobog","y":"Выдумки"},{"t":"Радегаст","k":"Радегаст Редигаст Radegast Титмар Адам Бременский Ретра бог гостеприимства","h":"#cab-radegast","y":"Выдумки"},{"t":"Лада, Лель, Полель","k":"Лада Лель Полель Ладо лёли Длугош Киевский синопсис Купало Ярило любовь Пушкин Онегин","h":"#cab-lada","y":"Выдумки"},{"t":"Ярило","k":"Ярило Ярила обряд кукла похороны Ярилы","h":"#cab-yarilo","y":"Выдумки"},{"t":"Купала","k":"Купала Купало Иван Купала праздник","h":"#cab-kupala","y":"Выдумки"},{"t":"Род и рожаницы","k":"Род рожаницы Слово святого Григория Рыбаков Данилевский Клейн","h":"#cab-rod","y":"Выдумки"},{"t":"Позвизд, Погода, Посвистач","k":"Позвизд Погода Посвистач Шишацкий-Иллич Длугош","h":"#cab-pozvizd","y":"Выдумки"},{"t":"Зимцерла","k":"Зимцерла Орбини альманах 1829 Баратынский","h":"#cab-zimcerla","y":"Выдумки"},{"t":"Белобог","k":"Белобог Чернобог Гельмольд добро зло","h":"#cab-belobog","y":"Выдумки"},{"t":"Коловрат","k":"Коловрат знак свастика символ","h":"#cab-kolovrat","y":"Выдумки"},{"t":"Славянские руны","k":"руны славянские руны резы","h":"#cab-runes","y":"Выдумки"},{"t":"Велесова книга","k":"Велесова книга Влесова книга дощечки Миролюбов Жар-птица подделка Зализняк","h":"#cab-velesovakniga","y":"Выдумки"},{"t":"Киев","k":"Киев Киевский холм Старокиевская гора Рыбаков фундамент 1975 Владимир 980 список богов","h":"#east","y":"место"},{"t":"Киевский холм: «реформа Владимира»","k":"реформа Владимира Лукин Клейн пантеон Псалом 105 Амартол ятвяги 983","h":"#reform","y":"раздел"},{"t":"Новгород и Волхов","k":"Новгород Волхов Добрыня Аким Корсунянин пидьблянин 989 палица","h":"#perun-novgorod","y":"место"},{"t":"Рюген и Аркона","k":"Рюген Аркона Каренца руяне 1168 датчане","h":"#west","y":"место"},{"t":"Поморье","k":"Поморье Щецин Волин Оттон Бамбергский Гельмольд Саксон Титмар","h":"#west","y":"место"},{"t":"Щецин","k":"Щецин Штеттин Триглав","h":"#triglav","y":"место"},{"t":"Ридегост / Ретра","k":"Ридегост Ридигост Ретра редарии Титмар","h":"#svarozhich","y":"место"},{"t":"Вольгаст","k":"Вольгаст Гавельберг Яровит","h":"#yarovit","y":"место"},{"t":"Каренца","k":"Каренца Рюген Ругевит","h":"#rugevit","y":"место"},{"t":"Старград вагров и Плуне","k":"Старград вагры Плуне Прове Подага","h":"#prove","y":"место"},{"t":"Берестяная грамота № 914","k":"берестяная грамота 914 Волоса Власий Новгород Троицкий раскоп Янин Зализняк","h":"#veles-914","y":"источник"},{"t":"Малала и глоссы «Сварог», «Дажьбог»","k":"Малала Иоанн Малала глосса Ипатьевская летопись 1114 Гефест Гелиос Сварог Дажьбог эвгемеризм","h":"#malala","y":"источник"},{"t":"«Повесть временных лет»","k":"Повесть временных лет ПВЛ летопись Ипатьевский Лаврентьевский список Радзивилловский Нестор","h":"#src-pvl","y":"источник"},{"t":"Ипатьевская летопись","k":"Ипатьевская летопись 1114 Малала","h":"#src-ipat","y":"источник"},{"t":"«Слово о полку Игореве»","k":"Слово о полку Игореве Боян внук Игорь 1185 издание 1800 Жуковский","h":"#src-slovo","y":"источник"},{"t":"Поучения против язычества","k":"Слово христолюбца Слово святого Григория Слово Златоуста поучение двоеверие Гальковский Борьба христианства с остатками язычества","h":"#src-uchenia","y":"источник"},{"t":"Прокопий Кесарийский","k":"Прокопий Кесарийский Война с готами VI век бог молнии Гкантзиос-Драпелова греческий текст","h":"#src-prokopiy","y":"источник"},{"t":"Константин Багрянородный","k":"Константин Багрянородный Об управлении империей остров святого Григория дуб","h":"#src-konstantin","y":"источник"},{"t":"Титмар Мерзебургский","k":"Титмар Мерзебургский Хроника Ретра Ридегост","h":"#src-titmar","y":"источник"},{"t":"Адам Бременский","k":"Адам Бременский Деяния гамбургских епископов Редигаст","h":"#src-adam","y":"источник"},{"t":"Гельмольд из Бозау","k":"Гельмольд Славянская хроника Прове чёрный бог Свентовит","h":"#src-helmold","y":"источник"},{"t":"Саксон Грамматик","k":"Саксон Грамматик Деяния данов Аркона Свентовит Каренца","h":"#src-saxo","y":"источник"},{"t":"Жития Оттона Бамбергского","k":"Жития Оттона Эббон Герборд Прюфенинг Триглав Яровит Щецин","h":"#src-otto","y":"источник"},{"t":"Збручский идол","k":"Збручский идол Збруч 1848 известняк четыре стороны Святовит","h":"#zbruch","y":"источник"},{"t":"Святой Власий","k":"Власий Святой Власий покровитель скота Волос","h":"#vlasiy","y":"раздел"},{"t":"Перынь","k":"Перынь Новгород святилище сопки","h":"#peryn","y":"раздел"},{"t":"Сроки и места (хронология)","k":"сроки места годы 907 912 945 971 980 988 хронология","h":"#timeline","y":"раздел"},{"t":"Словарь","k":"словарь кумир капище треба волхв тризна крада","h":"#glossary","y":"раздел"},{"t":"Как читать этот сайт: метки","k":"как читать метки источник гипотеза выдумка поздний источник слабый источник легенда","h":"#how","y":"раздел"},{"t":"Даты договоров 907 / 911 / 912 / 944 / 945","k":"даты договоров 907 911 912 944 945 971 Олег Игорь Святослав","h":"#how","y":"раздел"},{"t":"Где мы их находим: регионы и источники","k":"регионы центры путешествие по миру славян не единый пантеон Киев Новгород Поморье Рюген Ретра Щецин Вольгаст Старград Плуне Польские земли","h":"#where","y":"раздел"},{"t":"Рюген: Аркона и Каренца","k":"Рюген Аркона Каренца руяне Саксон Свентовит Ругевит 1168","h":"#reg-ruegen","y":"регион"},{"t":"Поморье: Щецин и Волин","k":"Поморье Щецин Штеттин Волин Оттон Триглав Эббон Герборд Гросс-Раден","h":"#reg-pomorie","y":"регион"},{"t":"Другие центры Полабья","k":"Ретра Ридегост Ридигост Вольгаст Гавельберг Старград вагров Плуне Прове Яровит Сварожич Титмар Адам Бременский","h":"#reg-other","y":"регион"},{"t":"Польские земли и Збруч","k":"Польша Польские земли Длугош Скерневицы Збруч Лучиньский","h":"#reg-traces","y":"регион"},{"t":"Карта источников","k":"карта схема точки места география Киев Новгород Рюген Аркона Каренца Щецин Волин Вольгаст Гавельберг Ретра Старград Плуне Гросс-Раден Збруч Польша","h":"#map","y":"раздел"},{"t":"Хронология","k":"хронология время века эпохи шкала времени как менялся образ бога Древность X век Средневековье Новое время XX век","h":"#chrono","y":"раздел"},{"t":"Как менялся образ Перуна","k":"Перун век VI 980 989 палица XV век перуновы стрелы четверг дуб топор","h":"#era-3","y":"хронология"},{"t":"Популярные мифы","k":"мифы заблуждения единый пантеон 12 богов функции атрибуты Велесова книга Лада Белобог Ярило что говорят источники","h":"#myths","y":"раздел"},{"t":"Источники по типам","k":"источники по типам летописи хроники археология этнография историки поздняя литература подделки сверено первоисточник","h":"#srctypes","y":"раздел"},{"t":"Опора: какие тексты стоят за сайтом","k":"опора библиография ссылки википедия лицензия CC BY-SA тексты онлайн","h":"#sources","y":"раздел"}];
    function norm(t) { return t.toLowerCase().replace(/ё/g, 'е').replace(/[«»"“”.,;:()\/№]/g, ' ').replace(/\s+/g, ' ').trim(); }
    IDX.forEach(function (e) { e.nt = norm(e.t); e.nk = norm(e.t + ' ' + e.k); });
    var q = $('#q'), res = $('#qres');
    function close() { res.hidden = true; }
    function search() {
      var v = norm(q.value);
      if (v.length < 2) { close(); res.innerHTML = ''; return; }
      var toks = v.split(' ');
      var hits = IDX.filter(function (e) { return toks.every(function (t) { return e.nk.indexOf(t) > -1; }); });
      hits.forEach(function (e) { e.sc = e.nt.indexOf(v) === 0 ? 0 : e.nt.indexOf(v) > -1 ? 1 : 2; });
      hits.sort(function (a, b) { return a.sc - b.sc; });
      hits = hits.slice(0, 8);
      res.innerHTML = hits.length ? hits.map(function (e) { return '<li><a href="' + e.h + '">' + e.t.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '<span>' + e.y + '</span></a></li>'; }).join('') : '<li class="qno">Ничего не найдено. Попробуйте «Велес», «Рюген» или «Киев».</li>';
      res.hidden = false;
    }
    q.addEventListener('input', search);
    q.addEventListener('focus', function () { if (norm(q.value).length >= 2) search(); });
    q.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { close(); }
      else if (e.key === 'ArrowDown') { var f = $('a', res); if (f) { e.preventDefault(); f.focus(); } }
      else if (e.key === 'Enter') { var a1 = $('a', res); if (a1) { e.preventDefault(); close(); goTo(a1.getAttribute('href').slice(1)); } }
    });
    res.addEventListener('keydown', function (e) {
      var links = $$('a', res), i = links.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); if (links[i + 1]) links[i + 1].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (i > 0) links[i - 1].focus(); else q.focus(); }
      else if (e.key === 'Escape') { close(); q.focus(); }
    });
    res.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a') : null;
      if (!a) return;
      e.preventDefault(); close(); goTo(a.getAttribute('href').slice(1));
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('.search')) close(); });
    $$('#cat a, #cat2 a, #chips a').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); goTo(a.getAttribute('href').slice(1)); });
    });
  })();


  /* кнопки «Источник»: описание и ссылка из блока «Откуда это знаем» */
  var SRC = {"ipat":{"t":"«Повесть временных лет», Ипатьевский список (изд. О. В. Творогова, 1997, Викитека)","u":["https://ru.wikisource.org/wiki/%D0%9F%D0%BE%D0%B2%D0%B5%D1%81%D1%82%D1%8C_%D0%B2%D1%80%D0%B5%D0%BC%D0%B5%D0%BD%D0%BD%D1%8B%D1%85_%D0%BB%D0%B5%D1%82_(%D0%9D%D0%B5%D1%81%D1%82%D0%BE%D1%80)/1997_(%D0%94%D0%9E)"],"k":"v","s":"Сверено с первоисточником (цитаты в древнерусском виде)."},"lavr":{"t":"«Повесть временных лет», Лаврентьевский список (ПСРЛ, т. I, изд. Е. Ф. Карского, litopys.org.ua)","u":["http://litopys.org.ua/lavrlet/lavr01.htm"],"k":"v","s":"Сверено с первоисточником."},"nsl":{"t":"Новгородская первая летопись младшего извода (изд. А. Н. Насонова, 1950, litopys.org.ua)","u":["http://litopys.org.ua/novglet/novg01.htm"],"k":"v","s":"Сверено с первоисточником."},"slovo":{"t":"«Слово о полку Игореве», издание 1800 года (Викитека)","u":["https://ru.wikisource.org/wiki/%D0%A1%D0%BB%D0%BE%D0%B2%D0%BE_%D0%BE_%D0%BF%D0%BE%D0%BB%D0%BA%D1%83_%D0%98%D0%B3%D0%BE%D1%80%D0%B5%D0%B2%D0%B5/%D0%A2%D0%B5%D0%BA%D1%81%D1%82"],"k":"v","s":"Сверено с первоисточником."},"zhuk":{"t":"«Слово о полку Игореве», перевод В. А. Жуковского (Викитека)","u":["https://ru.wikisource.org/wiki/%D0%A1%D0%BB%D0%BE%D0%B2%D0%BE_%D0%BE_%D0%BF%D0%BE%D0%BB%D0%BA%D1%83_%D0%98%D0%B3%D0%BE%D1%80%D0%B5%D0%B2%D0%B5_(%D0%96%D1%83%D0%BA%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9)"],"k":"v","s":"Сверено с первоисточником."},"gram914":{"t":"Берестяная грамота № 914 (gramoty.ru) и комментарий В. Л. Янина и А. А. Зализняка (Новгородские грамоты на бересте, т. XI)","u":["https://gramoty.ru/birchbark/document/show/novgorod/914/","https://gramoty.ru/thumbs/bibliography_file_supplement_ngb-11_novgorod_0915.pdf"],"k":"v","s":"Сверено с первоисточником."},"tat":{"t":"В. Н. Татищев, «История Российская», т. I, примечание 44 (spsl.nsc.ru)","u":["http://www.spsl.nsc.ru/history/tatisch/tatis004.htm"],"k":"v","s":"Сверено: палица — из «Ростовской» рукописи, а не из текста Иоакима."},"procopius":{"t":"Прокопий Кесарийский, «Война с готами», VII, 14 (VI век)","u":["https://czasopisma.uni.lodz.pl/sceranea/article/download/13159/12758/32304"],"k":"w","s":"Греческий текст и перевод — по статье Гкантзиос-Драпеловой (Studia Ceranea, 2021); том издания Прокопия не открывался. Что это Перун, — вывод (по ru.wikipedia «Перун»)."},"khozh":{"t":"«Хождение Богородицы по мукам» (список XII века)","u":["https://ru.wikipedia.org/wiki/%D0%92%D0%B5%D0%BB%D0%B5%D1%81"],"k":"w","s":"Только цитаты в статьях Википедии; сам текст не открывался. Первоисточник не сверялся."},"christ":{"t":"«Слово некоего христолюбца» и «Слово святого Григория, изобретено в толцех»","u":["https://ebooks.grsu.by/slav_miphol/pr_1.html"],"k":"w","s":"Текст в публикации ebooks.grsu.by (по изданию Аничкова, 1914), не по рукописи."},"zlat":{"t":"«Слово Златоуста о том, как первые язычники веровали в идолы» (изд. Н. М. Гальковского, 1913, т. II, с. 59–60)","u":["https://rodnovery.ru/images/knigi/Galkovskij_Borba_hristianstva-2.pdf"],"k":"v","s":"Сверено по изданию Гальковского (рукопись Новгородская Софийская № 1262, XIV–XV века); рукопись и прежние издания не открывались."},"saxo":{"t":"Саксон Грамматик, «Деяния данов», кн. XIV (латынь, Викитека)","u":["https://la.wikisource.org/wiki/Gesta_Danorum/Liber_XIV"],"k":"v","s":"Сверено с латинским текстом."},"helmold":{"t":"Гельмольд, «Славянская хроника» (латынь, издание MGH)","u":["https://www.dmgh.de/mgh_ss_rer_germ_32/index.htm"],"k":"v","s":"Сверено по скану издания MGH: I, 52 (с. 102–103) и I, 83 (с. 159–160)."},"titmar":{"t":"Титмар Мерзебургский, «Хроника», VI, 23 (латынь, издание MGH)","u":["https://www.dmgh.de/mgh_ss_rer_germ_n_s_9/index.htm"],"k":"v","s":"Сверено по скану издания MGH, с. 302–304."},"ebbo":{"t":"Эббон, «Жизнь Оттона» (Ph. Jaffé, Monumenta Bambergensia, 1869, archive.org)","u":["https://archive.org/details/vitaottonisepisc00ebbo"],"k":"v","s":"Сверено с первоисточником: III, 1 и II, 13."},"herbord":{"t":"Герборд, «Диалог о жизни Оттона» (Ph. Jaffé, Monumenta Bambergensia, 1869, archive.org)","u":["https://archive.org/details/monumentabamber00babegoog"],"k":"v","s":"Сверено с первоисточником: II, 32 и описание щецинских храмов."},"prufening":{"t":"Анонимный монах из Прюфенинга (MGH, SS XII)","u":["https://en.wikipedia.org/wiki/Triglav_(mythology)"],"k":"w","s":"Текст не открывался; пересказ — по en.wikipedia «Triglav (mythology)». Первоисточник не сверялся."},"yarovit":{"t":"Жития Оттона Бамбергского (Эббон, Герборд): места о Яровите","u":["https://ru.wikipedia.org/wiki/%D0%AF%D1%80%D0%BE%D0%B2%D0%B8%D1%82"],"k":"w","s":"Эти места в житиях не сверялись; сведения — по ru.wikipedia «Яровит»."},"prolog":{"t":"Проложное житие Владимира, 2-й вид (изд. Н. И. Милютенко, azbyka.ru)","u":["https://azbyka.ru/otechnik/Istorija_Tserkvi/svjatoj-ravnoapostolnyj-knjaz-vladimir-i-kreshhenie-rusi-drevnejshie-pismennye-istochniki/10"],"k":"v","s":"Сверено по изданию: «А Волоса идола, его же скотья именоваху бога, велѣ в Почаину воврещи». Рукопись не открывалась."},"beseda":{"t":"«Беседа трёх святителей»: место о Перуне и Хорсе (по А. П. Щапову, 1863)","u":["https://azbyka.ru/otechnik/Afanasij_Shapov/istoricheskie-ocherki-narodnogo-mirosozertsanija-i-sueverija/","https://rodnovery.ru/images/knigi/vasilev-yazychestvo-vostochnykh-slavyan.pdf"],"k":"w","s":"Цитата в научных публикациях (Щапов; Васильев), рукописи не открывались. В других списках чтение иное."}};
  var popN = 0;
  function closePop(btn) {
    var id = btn.getAttribute('aria-controls');
    var p = id && document.getElementById(id);
    if (p) p.parentNode.removeChild(p);
    btn.removeAttribute('aria-controls');
    btn.setAttribute('aria-expanded', 'false');
  }
  function esc2(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  $$('.srcb').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.getAttribute('aria-expanded') === 'true') { closePop(btn); return; }
      $$('.srcb[aria-expanded="true"]').forEach(closePop);
      var keys = btn.getAttribute('data-src').split(' ');
      var html = keys.map(function (k) {
        var e = SRC[k]; if (!e) return '';
        return '<div class="sp"><a href="' + esc2(e.u[0]) + '" target="_blank" rel="noopener noreferrer">' + esc2(e.t) + '</a>' + (e.u[1] ? ' · <a href="' + esc2(e.u[1]) + '" target="_blank" rel="noopener noreferrer">комментарий</a>' : '') + '<div class="sps ' + e.k + '">' + esc2(e.s) + '</div></div>';
      }).join('');
      var art = btn.closest('article.god');
      var refs = art ? 'refs-' + art.id : btn.closest('#cabinet') ? 'refs-cabinet' : 'refs-online';
      html += '<div class="spf"><a href="#' + refs + '" data-go="' + refs + '">Весь блок «' + (refs === 'refs-online' ? 'Ссылки: где читали онлайн' : 'Откуда это знаем') + '»</a><button type="button" class="spc">Закрыть</button></div>';
      var pop = document.createElement('div');
      pop.className = 'srcpop'; pop.id = 'sp-' + (++popN);
      pop.setAttribute('role', 'group'); pop.setAttribute('aria-label', 'Откуда это известно');
      pop.innerHTML = html;
      var c = btn.closest('p, li') || btn.parentNode;
      if (c.tagName === 'LI') c.appendChild(pop); else c.parentNode.insertBefore(pop, c.nextSibling);
      btn.setAttribute('aria-controls', pop.id);
      btn.setAttribute('aria-expanded', 'true');
      $('.spc', pop).addEventListener('click', function () { closePop(btn); btn.focus(); });
      $('[data-go]', pop).addEventListener('click', function (e) { e.preventDefault(); goTo(e.currentTarget.getAttribute('data-go')); });
      pop.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closePop(btn); btn.focus(); } });
    });
    btn.addEventListener('keydown', function (e) { if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') closePop(btn); });
  });

  /* кнопка «наверх» */
  var totop = $('#totop');
  function onScroll() { totop.classList.toggle('show', window.scrollY > Math.max(500, window.innerHeight)); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* подсветка текущего раздела в оглавлении */
  var toc = $('#toc');
  var linkById = {};
  $$('a', toc).forEach(function (a) { if (!a.classList.contains('navsearch')) linkById[a.getAttribute('href').slice(1)] = a; });
  var current = null;
  var navEl = $('#nav'), menubtn = $('#menubtn'), here = $('#here');
  function menu(on) { navEl.classList.toggle('open', on); menubtn.setAttribute('aria-expanded', on ? 'true' : 'false'); setNavH(); }
  menubtn.addEventListener('click', function () {
    var on = !navEl.classList.contains('open'); menu(on);
    if (on && current && linkById[current]) { var l = linkById[current]; var top = l.offsetTop - toc.clientHeight / 2 + l.offsetHeight / 2; toc.scrollTop = Math.max(0, top); }
  });
  toc.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('a')) menu(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && navEl.classList.contains('open')) { menu(false); menubtn.focus(); } });
  document.addEventListener('click', function (e) { if (navEl.classList.contains('open') && !e.target.closest('#nav')) menu(false); });
  window.addEventListener('resize', function () { if (window.innerWidth > 1119 && navEl.classList.contains('open')) menu(false); });
  function setCurrent(id) {
    if (current === id || !linkById[id]) return;
    current = id;
    here.textContent = linkById[id].textContent;
    $$('a', toc).forEach(function (a) { a.removeAttribute('aria-current'); });
    var a = linkById[id];
    a.setAttribute('aria-current', 'true');
    if (toc.scrollWidth > toc.clientWidth) {
      toc.scrollTo({ left: a.offsetLeft - (toc.clientWidth - a.offsetWidth) / 2, behavior: reduce ? 'auto' : 'smooth' });
    }
  }
  if ('IntersectionObserver' in window) {
    /* какой пункт меню подсвечивать: разделы страницы по порядку → пункт меню */
    var SEC = [['catalog', 'catalog'], ['intro', 'catalog'], ['how', 'how'], ['myths', 'myths'], ['east', 'catalog'], ['west', 'catalog'], ['curious', 'curious']];
    var vis = {};
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { vis[e.target.id] = e.isIntersecting; });
      for (var i = SEC.length - 1; i >= 0; i--) { if (vis[SEC[i][0]]) { setCurrent(SEC[i][1]); break; } }
    }, { rootMargin: '-35% 0px -55% 0px' });
    SEC.forEach(function (p) { var el = document.getElementById(p[0]); if (el) io.observe(el); });
  }

  /* быстрые переходы на телефоне: подсветка текущего раздела */
  var quick = $('#quick');
  if (quick) {
    var QS = [['catalog', 'catalog'], ['intro', 'catalog'], ['how', ''], ['myths', 'myths'], ['east', 'catalog'], ['west', 'catalog'], ['curious', ''], ['where', ''], ['map', 'map'], ['chrono', 'chrono'], ['cabinet', ''], ['more', ''], ['srctypes', 'srctypes'], ['sources', 'srctypes']];
    var qLinks = {};
    $$('a', quick).forEach(function (a) { qLinks[a.getAttribute('href').slice(1)] = a; });
    var qCur = null, qBusy = false;
    var qUpdate = function () {
      qBusy = false;
      var probe = nav.offsetHeight + window.innerHeight * 0.3, id = '';
      for (var i = 0; i < QS.length; i++) {
        var el = document.getElementById(QS[i][0]);
        if (!el) continue;
        var r = el.getBoundingClientRect();
        if (r.height && r.top <= probe && r.bottom > probe) id = QS[i][1];
      }
      if (id === qCur) return;
      qCur = id;
      $$('a', quick).forEach(function (a) { a.removeAttribute('aria-current'); });
      var a = id && qLinks[id];
      if (a) {
        a.setAttribute('aria-current', 'true');
        if (quick.scrollWidth > quick.clientWidth) quick.scrollTo({ left: a.offsetLeft - (quick.clientWidth - a.offsetWidth) / 2, behavior: 'auto' });
      }
    };
    var qSchedule = function () { if (!qBusy) { qBusy = true; requestAnimationFrame(qUpdate); } };
    window.addEventListener('scroll', qSchedule, { passive: true });
    window.addEventListener('resize', qSchedule);
    qUpdate();
  }

  /* «Поиск» в меню: к строке поиска и фокус в неё */
  var ns = $('.navsearch');
  if (ns) ns.addEventListener('click', function () { var q = $('#q'); setTimeout(function () { if (q) { try { q.focus({ preventScroll: true }); } catch (e) { q.focus(); } } }, reduce ? 0 : 450); });


  /* карта источников */
  (function () {
    var wrap = $('#mapwrap'); if (!wrap) return;
    document.documentElement.classList.add('mapjs');
    var mv = $('#mapv'), grat = $('#grat'), svg = $('#mapsvg'), mkn = $('#mknames'), mks = $$('.mk', mv), empty = $('#mapempty');
    var KX = 0.5878; /* cos 54°: подложка нарисована в той же проекции, что и положение точек */
    var V = {
      all: { lon: [9, 34], lat: [47.8, 59.4], step: 5, lstep: 2, labels: [
        [19.3, 56.7, 'Балтийское<br>море', 'sea'], [31.6, 45.7, 'Чёрное море', 'sea'],
        [32.55, 49.45, 'Днепр', 'wl'], [19.7, 53.1, 'Висла', 'wl'], [15.3, 52.0, 'Одра', 'wl'], [10.55, 52.7, 'Эльба', 'wl'], [32.0, 58.0, 'Волхов', 'wl'] ] },
      west: { lon: [10, 15.1], lat: [52.6, 55.0], step: 1, lstep: 0.5, labels: [
        [14.55, 54.62, 'Балтийское море', 'sea'], [14.45, 52.75, 'Одра', 'wl'], [10.75, 53.05, 'Эльба', 'wl'] ] }
    };
    var view = 'all', cur = null, box = { x0: 0, x1: 1, y0: 0, y1: 1 };
    var NAMES = {}; $$('.plbtn').forEach(function (b) { NAMES[b.getAttribute('data-id')] = $('strong', b).textContent; });
    NAMES.baltic = 'Побережье: 9 мест';
    /* рамка вида: заданный участок целиком + продолжение подложки до пропорций окна, без искажения масштаба */
    function fit() {
      var W = mv.clientWidth, H = mv.clientHeight, b = V[view]; if (!W || !H) return;
      var uw = (b.lon[1] - b.lon[0]) * KX, uh = b.lat[1] - b.lat[0], s = Math.min(W / uw, H / uh);
      var hw = W / s / 2, hh = H / s / 2, cx = (b.lon[0] + b.lon[1]) / 2 * KX, cy = (b.lat[0] + b.lat[1]) / 2;
      box = { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh };
      svg.setAttribute('viewBox', [Math.round(box.x0 * 1000), Math.round((64 - box.y1) * 1000), Math.round((box.x1 - box.x0) * 1000), Math.round((box.y1 - box.y0) * 1000)].join(' '));
    }
    function pos(v, lon, lat) { return [(lon * KX - box.x0) / (box.x1 - box.x0), (box.y1 - lat) / (box.y1 - box.y0)]; }
    function drawGrat() {
      var b = V[view], h = '', lo, la, x, y, lon0 = box.x0 / KX, lon1 = box.x1 / KX, W = mv.clientWidth, H = mv.clientHeight;
      for (lo = Math.ceil(lon0 / b.step) * b.step; lo <= lon1; lo += b.step) { x = pos(view, lo, 0)[0] * 100; h += '<i class="v" style="left:' + x + '%"></i><em style="left:calc(' + x + '% + 4px);bottom:2px">' + lo + '° в.д.</em>'; }
      for (la = Math.ceil(box.y0 / b.lstep) * b.lstep; la <= box.y1; la += b.lstep) { y = pos(view, 0, la)[1] * 100; h += '<i class="h" style="top:' + y + '%"></i><em style="top:calc(' + y + '% + 2px);left:4px">' + (Math.round(la * 10) / 10) + '° с.ш.</em>'; }
      grat.innerHTML = h;
    }
    function texts(vis, W, H) {
      mkn.innerHTML = '';
      var obs = vis.map(function (o) { return { x: o.x - 24, y: o.y - 24, w: 48, h: 48, o: o }; });
      function hit(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
      function free(r, self) { return r.x >= 2 && r.y >= 2 && r.x + r.w <= W - 2 && r.y + r.h <= H - 2 && !obs.some(function (b) { return b.o !== self && hit(r, b); }); }
      /* подписи воды: свободное место без наложения на маркеры; море — только над водой, реки — рядом с линией реки */
      var ldp = $('#g-' + view + ' .ld'), lkp = $('#g-' + view + ' .lk'), rvp = $('#g-' + view + ' .rv'), sp = svg.createSVGPoint();
      function landAt(x, y) {
        sp.x = (box.x0 + (box.x1 - box.x0) * x / W) / KX * KX * 1000; sp.y = (64 - (box.y1 - (box.y1 - box.y0) * y / H)) * 1000;
        return ldp.isPointInFill(sp) && !lkp.isPointInFill(sp);
      }
      function seaRect(R) {
        var i, j, n = 0, t = 0;
        for (i = 0; i <= 6; i++) for (j = 0; j <= 2; j++) { t++; if (landAt(R.x + R.w * i / 6, R.y + R.h * j / 2)) n++; }
        return n / t <= 0.08;
      }
      function riverSpots(cx, cy) {
        var L = rvp.getTotalLength(), n = 500, i, out = [], k = 1000 * (box.x1 - box.x0) / W;
        for (i = 0; i <= n; i++) {
          var q = rvp.getPointAtLength(L * i / n), x = (q.x - box.x0 * 1000) / k, y = (q.y - (64 - box.y1) * 1000) / k, d = Math.hypot(x - cx, y - cy);
          if (d <= 90) out.push({ x: x, y: y, d: d });
        }
        return out.sort(function (a, b) { return a.d - b.d; });
      }
      function water(l) {
        var p = pos(view, l[0], l[1]); if (p[0] < 0.03 || p[0] > 0.97 || p[1] < 0.04 || p[1] > 0.96) return;
        var sea = l[3] === 'sea', e = document.createElement('em'); e.className = l[3];
        e.innerHTML = W < 560 ? l[2].replace(' ', '<br>') : l[2]; mkn.appendChild(e);
        var w = e.offsetWidth, h = e.offsetHeight, cx = p[0] * W, cy = p[1] * H, found = null, r, a, i;
        if (sea) {
          for (var at = 0; at < 2 && !found; at++) {
            if (at) { e.className = 'sea tiny'; w = e.offsetWidth; h = e.offsetHeight; }
            for (r = 0; r <= 220 && !found; r += 12) {
              for (a = 0; a < (r ? 12 : 1) && !found; a++) {
                var R = { x: cx + r * Math.cos(a * Math.PI / 6) - w / 2, y: cy + r * Math.sin(a * Math.PI / 6) - h / 2, w: w, h: h };
                R.x = Math.max(4, Math.min(W - 4 - w, R.x));
                if (free(R) && seaRect(R)) found = R;
              }
            }
          }
        } else {
          var sp2 = riverSpots(cx, cy);
          for (i = 0; i < sp2.length && !found; i++) {
            var c2 = [{ x: sp2[i].x + 8, y: sp2[i].y - h / 2, w: w, h: h }, { x: sp2[i].x - 8 - w, y: sp2[i].y - h / 2, w: w, h: h }];
            for (a = 0; a < 2 && !found; a++) if (free(c2[a])) found = c2[a];
          }
        }
        if (!found) { mkn.removeChild(e); return; }
        e.style.left = found.x + 'px'; e.style.top = found.y + 'px'; obs.push({ x: found.x, y: found.y, w: found.w, h: found.h, o: null });
      }
      V[view].labels.filter(function (l) { return l[3] === 'sea'; }).forEach(water);
      if (W >= 560) vis.forEach(function (o) {
        var t = document.createElement('span'); t.textContent = NAMES[o.m.getAttribute('data-id')] || ''; mkn.appendChild(t);
        var w = t.offsetWidth, h = t.offsetHeight, c = [[o.x + 24, o.y - h / 2], [o.x - 24 - w, o.y - h / 2], [o.x - w / 2, o.y + 22], [o.x - w / 2, o.y - 22 - h]], i, ok = false;
        for (i = 0; i < c.length && !ok; i++) {
          var r = { x: c[i][0], y: c[i][1], w: w, h: h };
          if (!free(r, o.m && o)) continue;
          t.style.left = r.x + 'px'; t.style.top = r.y + 'px'; obs.push({ x: r.x, y: r.y, w: w, h: h, o: null }); ok = true;
        }
        if (!ok) mkn.removeChild(t);
      });
      V[view].labels.filter(function (l) { return l[3] !== 'sea'; }).forEach(water);
    }
    function layout() {
      var W = mv.clientWidth, H = mv.clientHeight, vis = [];
      mks.forEach(function (m) {
        var on = m.getAttribute('data-view') === view; m.classList.toggle('on-view', on);
        if (on) { var p = pos(view, +m.getAttribute('data-lon'), +m.getAttribute('data-lat')); vis.push({ m: m, x: p[0] * W, y: p[1] * H }); }
      });
      var MIN = 48, i, j, k;
      for (k = 0; k < 60; k++) {
        var moved = false;
        for (i = 0; i < vis.length; i++) for (j = i + 1; j < vis.length; j++) {
          var dx = vis[j].x - vis[i].x, dy = vis[j].y - vis[i].y, d = Math.sqrt(dx * dx + dy * dy);
          if (d < MIN) { if (d < 0.01) { dx = 1; dy = 0; d = 1; } var f = (MIN - d) / 2 / d; vis[i].x -= dx * f; vis[i].y -= dy * f; vis[j].x += dx * f; vis[j].y += dy * f; moved = true; }
        }
        vis.forEach(function (o) { o.x = Math.min(W - 24, Math.max(24, o.x)); o.y = Math.min(H - 24, Math.max(24, o.y)); });
        if (!moved) break;
      }
      vis.forEach(function (o) { o.m.style.left = (o.x / W * 100) + '%'; o.m.style.top = (o.y / H * 100) + '%'; });
      texts(vis, W, H);
    }
    function refresh() { fit(); drawGrat(); layout(); }
    function setView(v) {
      view = v; mv.classList.toggle('west', v === 'west');
      $$('.vbtn', wrap).forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-view') === v ? 'true' : 'false'); });
      refresh();
    }
    function select(id, fromUser) {
      var m = mks.filter(function (x) { return x.getAttribute('data-id') === id; })[0];
      if (id === 'baltic') { setView('west'); var f = $('.mk.on-view', mv); if (f) f.focus(); return; }
      if (!m) return;
      if (m.getAttribute('data-view') !== view) setView(m.getAttribute('data-view'));
      cur = id;
      mks.forEach(function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-id') === id ? 'true' : 'false'); });
      $$('.plbtn').forEach(function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-id') === id ? 'true' : 'false'); });
      $$('.pinfo').forEach(function (x) { x.classList.toggle('on', x.id === 'pi-' + id); });
      empty.style.display = 'none';
      var p = $('#pi-' + id);
      if (fromUser && p) { p.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }); }
    }
    mks.forEach(function (m) { m.addEventListener('click', function () { select(m.getAttribute('data-id'), true); }); });
    $$('.plbtn').forEach(function (b) { b.addEventListener('click', function () { select(b.getAttribute('data-id'), true); if (b.getAttribute('data-id') !== 'baltic') { var p = $('#pi-' + b.getAttribute('data-id')); if (p) { p.setAttribute('tabindex', '-1'); } } }); });
    $$('.vbtn', wrap).forEach(function (b) { b.addEventListener('click', function () { setView(b.getAttribute('data-view')); }); });
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(refresh, 80); });
    if (window.ResizeObserver) new ResizeObserver(function () { refresh(); }).observe(mv);
    setView('all');
  })();

  /* фоновая музыка: выключена по умолчанию, файл грузится только после первого включения */
  (function () {
    var mb = $('#music');
    var VOL = 0.25, DUCK = 0.08, FADE = 1500;
    var bg = null, want = false, resumeOnShow = false, fadeTimer = null, voiceTimer = null;
    var KEY = 'slavic-gods-music';
    function stored(v) { try { if (v === undefined) return localStorage.getItem(KEY); localStorage.setItem(KEY, v); } catch (e) {} return null; }
    function voiceOn() { return $$('audio[data-title]').some(function (a) { return !a.paused && !a.ended; }); }
    function target() { return voiceOn() ? DUCK : VOL; }
    function ui() {
      mb.classList.toggle('is-on', want);
      mb.setAttribute('aria-label', want ? 'Выключить музыку' : 'Включить музыку');
      mb.title = want ? 'Выключить музыку' : 'Включить музыку';
    }
    function fadeTo(v, ms, done) {
      clearInterval(fadeTimer);
      var from = bg.volume, t0 = Date.now();
      if (ms <= 0 || from === v) { bg.volume = v; if (done) done(); return; }
      fadeTimer = setInterval(function () {
        var k = Math.min(1, (Date.now() - t0) / ms);
        bg.volume = Math.max(0, Math.min(1, from + (v - from) * k));
        if (k >= 1) { clearInterval(fadeTimer); if (done) done(); }
      }, 30);
    }
    function start() {
      if (!bg) {
        bg = new Audio();
        bg.loop = true;
        bg.preload = 'auto';
        bg.src = 'audio/ambient.mp3';
        bg.volume = 0;
      }
      want = true; ui(); stored('on');
      var p = bg.play();
      var ok = function () { if (want) fadeTo(target(), FADE); };
      if (p && p.then) {
        p.then(ok, function () { want = false; ui(); });
      } else { ok(); }
    }
    function stop() {
      want = false; ui(); stored('off');
      if (!bg) return;
      fadeTo(0, FADE, function () { if (!want) bg.pause(); });
    }
    mb.addEventListener('click', function () { if (want) stop(); else start(); });
    if (stored() === 'on') mb.classList.add('hint');

    /* озвучка приглушает музыку, пауза возвращает громкость */
    function retarget(ms) { if (bg && want && !bg.paused) fadeTo(target(), ms); }
    document.addEventListener('play', function (e) {
      if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-title')) { clearTimeout(voiceTimer); retarget(700); }
    }, true);
    function released(e) {
      if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-title')) {
        clearTimeout(voiceTimer);
        voiceTimer = setTimeout(function () { retarget(FADE); }, 250); /* пауза между дорожками не должна дёргать громкость */
      }
    }
    document.addEventListener('pause', released, true);
    document.addEventListener('ended', released, true);

    /* скрытая вкладка: пауза и возобновление */
    document.addEventListener('visibilitychange', function () {
      if (!bg) return;
      if (document.hidden) {
        if (want && !bg.paused) { resumeOnShow = true; clearInterval(fadeTimer); bg.pause(); }
      } else if (resumeOnShow && want) {
        resumeOnShow = false;
        bg.volume = 0;
        var p = bg.play();
        if (p && p.then) p.then(function () { if (want) fadeTo(target(), FADE); }, function () { want = false; ui(); });
      }
    });
  })();

  /* аудиоплеер */
  var players = [];
  function fmt(t) {
    if (!isFinite(t) || t < 0) t = 0;
    var m = Math.floor(t / 60), s = Math.floor(t % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  $$('audio[data-title]').forEach(function (a) {
    var title = a.getAttribute('data-title');
    a.removeAttribute('controls');
    a.preload = 'none';
    var box = document.createElement('div');
    box.className = 'player';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Озвучка: ' + title);
    box.innerHTML =
      '<button type="button" class="pbtn">' +
      '<svg class="i-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>' +
      '<svg class="i-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg></button>' +
      '<input class="pseek" type="range" min="0" max="1000" step="1" value="0">' +
      '<span class="ptime" role="timer" aria-live="off">0:00 / 0:00</span>';
    a.parentNode.insertBefore(box, a);
    box.appendChild(a);
    var btn = $('.pbtn', box), seek = $('.pseek', box), time = $('.ptime', box);
    var pending = null;
    btn.setAttribute('aria-label', 'Слушать: ' + title);
    seek.setAttribute('aria-label', 'Перемотка: ' + title);

    function ui() {
      var d = a.duration, c = a.currentTime || 0;
      var frac = isFinite(d) && d > 0 ? c / d : 0;
      seek.value = Math.round(frac * 1000);
      seek.style.setProperty('--p', (frac * 100).toFixed(1) + '%');
      var txt = fmt(c) + ' / ' + (isFinite(d) ? fmt(d) : '0:00');
      time.textContent = txt;
      seek.setAttribute('aria-valuetext', txt.replace(' / ', ' из '));
    }
    function setPlaying(on) {
      box.classList.toggle('is-playing', on);
      btn.setAttribute('aria-label', (on ? 'Пауза: ' : 'Слушать: ') + title);
    }
    btn.addEventListener('click', function () {
      if (a.paused) {
        var p = a.play();
        if (p && p.catch) p.catch(function () { time.textContent = 'не запустилось'; setPlaying(false); });
      } else { a.pause(); }
    });
    a.addEventListener('play', function () {
      players.forEach(function (o) { if (o !== a && !o.paused) o.pause(); });
      setPlaying(true);
    });
    a.addEventListener('pause', function () { setPlaying(false); });
    a.addEventListener('ended', function () { setPlaying(false); a.currentTime = 0; ui(); });
    a.addEventListener('timeupdate', ui);
    a.addEventListener('durationchange', ui);
    a.addEventListener('loadedmetadata', function () {
      if (pending !== null && isFinite(a.duration)) { a.currentTime = pending * a.duration; pending = null; }
      ui();
    });
    a.addEventListener('error', function () { setPlaying(false); time.textContent = 'ошибка загрузки'; });
    function seekTo(frac) {
      frac = Math.max(0, Math.min(1, frac));
      if (isFinite(a.duration) && a.duration > 0) { a.currentTime = frac * a.duration; }
      else { pending = frac; a.load(); }
    }
    seek.addEventListener('input', function () { seekTo(seek.value / 1000); if (isFinite(a.duration)) ui(); });
    seek.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 5 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -5 : 0;
      if (!d || !isFinite(a.duration)) return;
      e.preventDefault();
      a.currentTime = Math.max(0, Math.min(a.duration, a.currentTime + d));
      ui();
    });
    players.push(a);
    ui();
  });
})();
