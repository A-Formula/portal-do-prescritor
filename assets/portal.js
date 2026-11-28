/* Sistema do prescritor — v3
   Entrada: AFPresc.mount(container, getToken, accessData). getToken() → Promise<ID token>.
   Dados: GET /api/prescritor-sistema (perfil + lâminas) e ?img=NN-P (páginas, webp).
   Receita = lista de CÓPIAS editáveis das fórmulas (o original da lâmina nunca muda).
   Privacidade: nada do paciente sai do navegador; receituário (logo, rodapé, farmácia) e a receita
   em andamento ficam só neste navegador (localStorage). Nenhuma escrita no Firestore. */
(function () {
  "use strict";
  var esc = function (s) { return (s == null ? "" : String(s)).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var norm = function (s) { return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); };
  var LS_CFG = "afp-receituario-v1", LS_RX = "afp-receita-v1", LS_TOUR = "afp-tour-v1";
  // Fase de teste: tutorial em todo login. Depois da aprovação, trocar para false (volta a ser só no 1º acesso).
  var TOUR_SEMPRE = true;
  function lsGet(k, d) { try { return JSON.parse(localStorage.getItem(k) || "null") || d; } catch (_) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } }

  var S = { laminas: [], perfil: {}, lojas: [], tab: "inicio", q: "", esp: null, rx: [], imgCache: {}, open: null, paciente: "" };

  var ICON = {
    inicio: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    formulas: '<path d="M9 3h6"/><path d="M10 3v6.5L4.6 18.4A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.4-2.6L14 9.5V3"/><path d="M7.5 15h9"/>',
    laminas: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
    prescrever: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    receituario: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="9" r="2.5"/><path d="M8 16c.8-1.6 2.2-2.4 4-2.4s3.2.8 4 2.4"/>',
    busca: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    mais: '<path d="M12 5v14M5 12h14"/>', ok: '<path d="m5 12 5 5 9-10"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
    doses: '<rect x="3" y="8" width="18" height="8" rx="4"/><path d="M12 8v8"/>',
    escudo: '<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/>',
    editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/>',
    sair: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 16l-4-4 4-4"/><path d="M6 12h10"/>',
    lixo: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
    voltar: '<path d="M15 18l-6-6 6-6"/>', loja: '<path d="M3 9l1.5-5h15L21 9M4 9v11h16V9M3 9h18M9 20v-6h6v6"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
    paciente: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'
  };
  function ic(n, sz) { return '<svg class="afp-ic" width="' + (sz || 20) + '" height="' + (sz || 20) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[n] + "</svg>"; }

  /* Formas farmacêuticas da manipulação — ícone + nome (o nome sempre aparece). via = sugestão automática. */
  var P = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
  var FI = {
    capsula: '<g transform="rotate(-40 16 16)"><rect x="5" y="11" width="22" height="10" rx="5"/><path d="M16 11v10"/></g>',
    gastro: '<g transform="rotate(-40 16 16)"><rect x="5" y="11" width="22" height="10" rx="5"/><path d="M16 11v10"/></g><path d="M24 19.5l4 1.5v3c0 2.4-1.7 4.2-4 4.8-2.3-.6-4-2.4-4-4.8v-3z"/>',
    vegetal: '<g transform="rotate(-40 16 16)"><rect x="5" y="11" width="22" height="10" rx="5"/><path d="M16 11v10"/></g><path d="M21 28c0-4 3-7 7-7 0 4-3 7-7 7zM21 28l4-4"/>',
    softgel: '<ellipse cx="16" cy="16" rx="11" ry="7" transform="rotate(-30 16 16)"/><path d="M12 17c0-2 2-4 2-4s2 2 2 4a2 2 0 0 1-4 0z"/>',
    comprimido: '<circle cx="16" cy="16" r="10"/><path d="M9 16h14"/>',
    sublingual: '<circle cx="16" cy="12" r="6"/><path d="M6 22c3 4 7 6 10 6s7-2 10-6"/><path d="M11 22c2 2 3.5 2.5 5 2.5s3-.5 5-2.5"/>',
    po: '<path d="M6 14h14l-2 12H8z"/><path d="M20 16l7-5"/><path d="M11 10l1-2M15 9l.5-3M9 6l.5 1"/>',
    sache: '<path d="M8 7l2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2v18a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z"/><path d="M12 15h8M12 19h5"/>',
    goma: '<circle cx="11" cy="9" r="3"/><circle cx="21" cy="9" r="3"/><path d="M9 13c-1.5 2-2 4-1 6l-1 5c0 2 2 3 4 2l2-1h6l2 1c2 1 4 0 4-2l-1-5c1-2 .5-4-1-6-2-2-4-3-7-3s-5 1-7 3z"/>',
    pirulito: '<circle cx="13" cy="12" r="8"/><path d="M13 12c0-2.5 2-4 4-3M13 12c0 2.5-2.5 4-4.5 3"/><path d="M19 18l8 9"/>',
    chocolate: '<rect x="6" y="5" width="20" height="22" rx="2"/><path d="M6 12h20M6 19h20M13 5v22M19 5v22"/>',
    strip: '<rect x="4" y="11" width="24" height="10" rx="2" transform="rotate(-12 16 16)"/><path d="M9 15l14-3" opacity=".5"/>',
    cafe: '<path d="M6 12h16v7a7 7 0 0 1-7 7h-2a7 7 0 0 1-7-7z"/><path d="M22 14h2a3 3 0 0 1 0 6h-2"/><path d="M11 4c-1 2 1 3 0 5M16 4c-1 2 1 3 0 5"/>',
    gotas: '<path d="M16 4c5 6 8 10 8 14a8 8 0 0 1-16 0c0-4 3-8 8-14z"/><path d="M12 19a4 4 0 0 0 4 4"/>',
    xarope: '<path d="M13 4h6v4l3 3v15a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V11l3-3z"/><path d="M10 17h12"/>',
    shot: '<path d="M12 4h8M13 4v5l-2 3v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V12l-2-3V4"/><path d="M11 18h10"/>',
    creme: '<rect x="6" y="14" width="20" height="13" rx="3"/><rect x="8" y="9" width="16" height="5" rx="1.5"/><path d="M11 20h10"/>',
    gel: '<path d="M9 5h14l-2 18h-10z"/><path d="M13 23h6v3h-6z"/><path d="M11 10h10"/>',
    locao: '<path d="M14 4h6M17 4v4M12 8h10v3l2 3v12a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V14l2-3z"/><path d="M20 4v-1h4"/>',
    serum: '<path d="M14 3h4v5h-4z"/><path d="M12 8h8v2l2 3v13a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V13l2-3z"/><path d="M16 15v6"/><circle cx="16" cy="23" r="1"/>',
    shampoo: '<path d="M12 6h8v4l3 4v12a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V14l3-4z"/><path d="M14 3h4v3h-4z"/><path d="M13 18c2-2 4 2 6 0"/>',
    transdermico: '<path d="M8 20V11a2 2 0 0 1 4 0v6M12 15V8a2 2 0 0 1 4 0v8M16 12V9a2 2 0 0 1 4 0v8M20 14a2 2 0 0 1 4 0v4c0 5-3 9-8 9-3 0-5-1-7-4l-3-4a2 2 0 0 1 3-2l2 2"/>',
    stick: '<rect x="11" y="13" width="10" height="15" rx="2"/><path d="M12 13V8c0-2 1.5-4 4-4s4 2 4 4v5"/><path d="M11 18h10"/>',
    spray: '<path d="M12 12h8v14a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z"/><path d="M13 12V8h6v4M19 8h3M25 6h.01M25 9h.01M27 7.5h.01"/>',
    ovulo: '<path d="M16 4c5 0 8 7 8 13a8 8 0 0 1-16 0c0-6 3-13 8-13z"/><path d="M12 15c1-3 2-5 4-6"/>',
    colirio: '<path d="M14 4h4v4l3 3v6H11v-6l3-3z"/><path d="M11 17h10v7a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2z"/><path d="M16 28v2"/>',
    outra: '<circle cx="16" cy="16" r="11"/><path d="M11 16h.01M16 16h.01M21 16h.01"/>'
  };
  var FOTO = { capsula: "produto-capsulas", gastro: "produto-capsulas", vegetal: "produto-capsulas", goma: "forma-goma", pirulito: "forma-pirulito",
    chocolate: "forma-chocolate", strip: "forma-filme", gel: "forma-gel", gotas: "forma-gotas", sache: "forma-sache", shot: "forma-shot",
    // spray, sublingual, xarope, café, creme e comprimido: fotos não existem no repo (404) — usam o ícone desenhado
  };
  function foto(n, sz) {
    if (!FOTO[n]) return '<span class="afp-ph afp-ph-ic" style="width:' + sz + 'px;height:' + sz + 'px">' + fic(n, Math.round(sz * .55)) + "</span>";
    return '<span class="afp-ph" style="width:' + sz + 'px;height:' + sz + 'px"><img alt="" src="assets/fotos/' + FOTO[n] + '-thumb.webp"></span>';
  }
  function fic(n, sz) { return '<svg class="afp-ic" width="' + (sz || 30) + '" height="' + (sz || 30) + '" viewBox="0 0 32 32" ' + P + ' aria-hidden="true">' + (FI[n] || FI.outra) + "</svg>"; }
  var FORMAS = [
    { g: "Cápsulas e comprimidos", itens: [
      ["capsula", "Cápsula", "oral"], ["gastro", "Cápsula gastrorresistente", "oral"], ["vegetal", "Cápsula vegetal", "oral"],
      ["softgel", "Cápsula oleosa (softgel)", "oral"], ["comprimido", "Comprimido", "oral"], ["sublingual", "Comprimido sublingual", "sublingual"]] },
    { g: "Formas diferenciadas", itens: [
      ["goma", "Goma (gummy)", "oral"], ["pirulito", "Pirulito", "oral"], ["chocolate", "Chocolate funcional", "oral"],
      ["strip", "Strip oral (filme)", "oral"], ["cafe", "Café funcional", "oral"], ["sache", "Sachê", "oral"], ["po", "Pó", "oral"]] },
    { g: "Líquidos", itens: [
      ["gotas", "Gotas", "oral"], ["xarope", "Xarope / solução oral", "oral"], ["shot", "Shot / flaconete", "oral"]] },
    { g: "Uso tópico", itens: [
      ["creme", "Creme", "tópica"], ["gel", "Gel", "tópica"], ["locao", "Loção", "tópica"], ["serum", "Sérum", "tópica"],
      ["shampoo", "Shampoo", "tópica"], ["stick", "Stick", "tópica"], ["spray", "Spray", "tópica"], ["transdermico", "Gel transdérmico", "transdérmica"]] },
    { g: "Outras vias", itens: [
      ["ovulo", "Óvulo vaginal", "vaginal"], ["colirio", "Colírio", "oftálmica"]] }
  ];
  var FORMA_LIST = []; FORMAS.forEach(function (g) { g.itens.forEach(function (i) { FORMA_LIST.push({ id: i[0], nome: i[1], via: i[2] }); }); });
  // reconhece a forma escrita na lâmina ("cápsula gastrorresistente", "creme vaginal"…) — a mais específica vence
  function formaDe(txt) {
    var t = norm(txt); if (!t) return null;
    var regras = [["gastro", /gastro/], ["vegetal", /vegetal|veg\b/], ["softgel", /oleos|softgel/], ["sublingual", /sublingual/], ["goma", /goma|gummy|gomin/],
      ["pirulito", /pirulito/], ["chocolate", /chocolate/], ["strip", /strip|filme/], ["cafe", /cafe/], ["sache", /sache/], ["ovulo", /ovulo/],
      ["transdermico", /transderm|pentravan|plo/], ["shampoo", /shampoo/], ["serum", /serum/], ["locao", /locao/], ["spray", /spray/], ["stick", /stick/],
      ["colirio", /colirio/], ["gotas", /gota/], ["xarope", /xarope|solucao oral|suspens/], ["shot", /shot|flaconete/], ["gel", /\bgel\b/],
      ["creme", /creme|pomada/], ["comprimido", /comprimido/], ["po", /\bpo\b/], ["capsula", /capsula/]];
    for (var i = 0; i < regras.length; i++) if (regras[i][1].test(t)) return regras[i][0];
    return null;
  }

  // A API do sistema responde pela função de cadastro (?sistema=1) — sem 13ª função na Vercel.
  var API_URL = (window.PORTAL_API || "https://www.aformulabr.com.br") + "/api/prescritor-cadastro?sistema=1";
  function api(qs) {
    return S.getToken().then(function (t) { return fetch(API_URL + (qs ? "&" + qs.replace(/^\?/, "") : ""), { headers: { Authorization: "Bearer " + t } }); });
  }

  /* ---------- montagem ---------- */
  function mount(el, getToken, access) {
    S.el = el; S.getToken = getToken; S.access = access || {}; S.pac = null; S.farm = null; S.pacId = null; S.farmId = "";
    el.innerHTML = "";
    // TRAVA: fora do piloto (403) ou com qualquer erro, o sistema some e a página fica exatamente como antes.
    function sair() { if (el.parentNode) el.parentNode.removeChild(el); }
    Promise.all([
      api().then(function (r) { if (!r.ok) throw new Error("api " + r.status); return r.json(); }),
      fetch("assets/lojas.json").then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; })
    ]).then(function (x) {
      S.laminas = x[0].laminas || []; S.minhas = x[0].minhas || []; S.lojas = x[1] || []; invalidar();
      aplicarPerfil(x[0].perfil || {});
      S.rx = lsGet(LS_RX, []);
      if (!S.perfil.consultorioCompleto) return viewConsultorio(false);   // 2ª etapa obrigatória
      render();
    }).catch(function (e) {
      if (window.console) console.warn("[area-prescritor] sistema desligado:", e && e.message);
      sair();
    });
  }
  // Identificação e rodapé vêm do CADASTRO (não editáveis no receituário). Neste navegador só: logo e farmácia.
  function aplicarPerfil(p) {
    S.perfil = p;
    var salvo = lsGet(LS_CFG, {}), cid = p.cidadeConsultorio || p.cidade, uf = p.ufEndereco || p.uf;
    var linha1 = [[p.endereco, p.numero, p.complemento].filter(Boolean).join(", "), p.bairro, [cid, uf].filter(Boolean).join("/"), p.cep ? "CEP " + p.cep : ""].filter(Boolean).join(" — ");
    var linha2 = [p.telConsultorio || p.telefone, p.emailReceita || p.email].filter(Boolean).join(" · ");
    S.cfg = {
      nome: p.nome || S.access.nome || "",
      registro: [p.conselho, p.registroNumero].filter(Boolean).join(" ") + (p.uf ? "/" + p.uf : ""),
      especialidade: p.especialidade || "",
      rodape: [linha1, linha2].filter(Boolean).join("\n"),
      logo: (/^data:image\/png;base64,[A-Za-z0-9+\/=]+$/.test(salvo.logo || "") ? salvo.logo : ""), farmaciaOn: !!salvo.farmaciaOn, farmaciaId: salvo.farmaciaId || ""
    };
  }

  /* ---------- 2ª etapa do cadastro: consultório (obrigatória antes de usar) ---------- */
  var UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];
  function viewConsultorio(editando) {
    var p = S.perfil, el = S.el;
    function fld(id, rotulo, val, extra) { return '<label class="afp-full"><span>' + rotulo + '</span><input class="afp-in" id="' + id + '" value="' + esc(val || "") + '" ' + (extra || "") + "></label>"; }
    el.innerHTML = '<div class="afp-onb"><div class="afp-onb-card">' +
      (editando ? '<button class="afp-link afp-back" data-voltar>' + ic("voltar", 16) + " Voltar</button>" : "") +
      '<span class="afp-onb-ic">' + ic("receituario", 26) + "</span>" +
      "<h2>" + (editando ? "Dados do consultório" : "Falta pouco: complete seu cadastro") + "</h2>" +
      "<p>" + (editando ? "Esses dados aparecem no rodapé da sua receita." : "Para liberar as formulações, as lâminas e o receituário, informe o consultório. Esses dados aparecem no rodapé da sua receita.") + "</p>" +
      '<div class="afp-onb-id">' + ic("escudo", 16) + "<span><b>" + esc(S.cfg.nome) + "</b> · " + esc(S.cfg.registro) + (S.cfg.especialidade ? " · " + esc(S.cfg.especialidade) : "") + "</span></div>" +
      '<form id="afp-cons" novalidate>' +
      '<div class="afp-onb-g"><div class="afp-g-cep">' + fld("c-cep", "CEP *", p.cep, 'inputmode="numeric" autocomplete="postal-code" placeholder="00000-000"') + "</div>" +
      '<div class="afp-g-end">' + fld("c-end", "Endereço *", p.endereco, 'autocomplete="address-line1" placeholder="Rua, avenida"') + "</div>" +
      '<div class="afp-g-num">' + fld("c-num", "Número *", p.numero, 'placeholder="123"') + "</div>" +
      '<div class="afp-g-comp">' + fld("c-comp", "Complemento", p.complemento, 'placeholder="Sala, andar"') + "</div>" +
      '<div class="afp-g-bai">' + fld("c-bai", "Bairro *", p.bairro) + "</div>" +
      '<div class="afp-g-cid">' + fld("c-cid", "Cidade *", p.cidadeConsultorio || p.cidade) + "</div>" +
      '<div class="afp-g-uf"><label class="afp-full"><span>Estado *</span><select class="afp-in" id="c-uf"><option value="">UF</option>' +
      UFS.map(function (u) { return '<option' + ((p.ufEndereco || p.uf) === u ? " selected" : "") + ">" + u + "</option>"; }).join("") + "</select></label></div>" +
      '<div class="afp-g-tel">' + fld("c-tel", "Telefone do consultório *", p.telConsultorio || p.telefone, 'type="tel" placeholder="(11) 3000-0000"') + "</div>" +
      '<div class="afp-g-mail">' + fld("c-mail", "E-mail na receita", p.emailReceita, 'type="email" placeholder="Opcional — se diferente do e-mail de acesso"') + "</div></div>" +
      '<p class="afp-msg" id="c-msg"></p>' +
      '<button class="afp-btn afp-btn-lg" type="submit">' + ic("ok", 18) + (editando ? " Salvar" : " Concluir cadastro e entrar") + "</button></form></div></div>";
    var f = el.querySelector("#afp-cons"), msgEl = el.querySelector("#c-msg"), g = function (id) { return el.querySelector("#" + id); };
    var vb = el.querySelector("[data-voltar]"); if (vb) vb.addEventListener("click", function () { S.tab = "receituario"; render(); });
    // CEP → preenche endereço (ViaCEP; só o CEP sai do navegador)
    g("c-cep").addEventListener("input", function () {
      var d = this.value.replace(/\D/g, "").slice(0, 8);
      this.value = d.length > 5 ? d.slice(0, 5) + "-" + d.slice(5) : d;
      if (d.length !== 8) return;
      fetch("https://viacep.com.br/ws/" + d + "/json/").then(function (r) { return r.json(); }).then(function (j) {
        if (!j || j.erro) return;
        if (!g("c-end").value) g("c-end").value = j.logradouro || "";
        if (!g("c-bai").value) g("c-bai").value = j.bairro || "";
        g("c-cid").value = j.localidade || g("c-cid").value; g("c-uf").value = j.uf || g("c-uf").value;
        (g("c-end").value ? g("c-num") : g("c-end")).focus();
      }).catch(function () {});
    });
    f.addEventListener("input", function (e) { e.target.classList && e.target.classList.remove("afp-bad"); });
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var c = { cep: g("c-cep").value.trim(), endereco: g("c-end").value.trim(), numero: g("c-num").value.trim(), complemento: g("c-comp").value.trim(),
        bairro: g("c-bai").value.trim(), cidadeConsultorio: g("c-cid").value.trim(), ufEndereco: g("c-uf").value, telConsultorio: g("c-tel").value.trim(), emailReceita: g("c-mail").value.trim() };
      var regras = [["c-cep", c.cep.replace(/\D/g, "").length === 8], ["c-end", !!c.endereco], ["c-num", !!c.numero], ["c-bai", !!c.bairro], ["c-cid", !!c.cidadeConsultorio],
        ["c-uf", !!c.ufEndereco], ["c-tel", c.telConsultorio.replace(/\D/g, "").length >= 10], ["c-mail", !c.emailReceita || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.emailReceita)]];
      var ruim = regras.filter(function (r) { g(r[0]).classList.toggle("afp-bad", !r[1]); return !r[1]; });
      if (ruim.length) { msgEl.className = "afp-msg on"; msgEl.textContent = "Confira os campos destacados."; g(ruim[0][0]).focus(); return; }
      var btn = f.querySelector("button[type=submit]"); btn.disabled = true; msgEl.className = "afp-msg";
      S.getToken().then(function (t) {
        return fetch(API_URL, { method: "POST", headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" }, body: JSON.stringify({ consultorio: c }) });
      }).then(function (r) { if (!r.ok) throw r.status; return r.json(); }).then(function () {
        var np = Object.assign({}, S.perfil, c, { consultorioCompleto: true }); aplicarPerfil(np);
        if (!editando) S.tab = "inicio";
        render(); toast(editando ? "Dados do consultório atualizados" : "Cadastro concluído");
      }).catch(function () { btn.disabled = false; msgEl.className = "afp-msg on"; msgEl.textContent = "Não foi possível salvar agora. Tente de novo em instantes."; });
    });
    g(p.cep ? "c-num" : "c-cep").focus();
  }
  function saveRx() { lsSet(LS_RX, S.rx); }

  /* ---------- início + tutorial guiado ---------- */
  function irPara(tab) { S.tab = tab; S.open = null; render(); window.scrollTo({ top: S.el.getBoundingClientRect().top + scrollY - 90, behavior: "smooth" }); }
  function viewInicio(v) {
    var nF = todas().filter(function (it) { return !it.minha; }).length;
    var acts = [
      ["formulas", "formulas", "Buscar uma fórmula", "Por nome, ativo ou condição."],
      ["minhas", "editar", "Criar do zero", "Monte e guarde as suas fórmulas."],
      ["laminas", "laminas", "Ler as lâminas", "Material técnico completo."],
      ["prescrever", "prescrever", "Montar a receita", S.rx.length ? S.rx.length + (S.rx.length > 1 ? " fórmulas" : " fórmula") + " na receita." : "Paciente, impressão e envio."]
    ];
    v.innerHTML = head("Seu *portal*", "Tudo o que você precisa para prescrever fórmulas magistrais, em um lugar só.",
        '<button class="afp-ghost" data-tour>' + ic("ok", 16) + " Ver tutorial</button>") +
      '<div class="afp-home-stats"><div><b>' + S.laminas.length + '</b><span>lâminas técnicas</span></div><div><b>' + nF + '</b><span>fórmulas prontas</span></div><div><b>' + (S.minhas || []).length + '</b><span>fórmulas suas</span></div><div><b>' + S.rx.length + '</b><span>na receita</span></div></div>' +
      '<div class="afp-home-acts">' + acts.map(function (a) {
        return '<button class="afp-home-act" data-go-tab="' + a[0] + '"><span class="afp-navic">' + ic(a[1], 22) + "</span><b>" + esc(a[2]) + "</b><small>" + esc(a[3]) + '</small><i aria-hidden="true">→</i></button>';
      }).join("") + "</div>";
    v.querySelectorAll("[data-go-tab]").forEach(function (b) { b.addEventListener("click", function () { irPara(b.getAttribute("data-go-tab")); }); });
    v.querySelector("[data-tour]").addEventListener("click", tour);
  }
  function tour() {
    if (S.tourOn) return; S.tourOn = true;
    var rxAntes = S.rx.length, simulou = false;
    var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var steps = [
      { sel: ".afp-top", t: "Bem-vindo ao Portal do prescritor", d: "Um tour rápido de 8 passos. Pule quando quiser (Esc)." },
      { sel: ".afp-side nav", t: "Tudo fica neste menu", d: "Formulações, Meu receituário, Lâminas, Prescrever, Pacientes, Farmácias parceiras e o Modelo da receita." },
      { go: "formulas", sel: ".afp-search", t: "Busque uma fórmula", d: "Por ativo, condição ou nome. Os filtros refinam por forma e via." },
      { act: function () { var c = document.querySelector("#afp-view [data-det]"); if (c) c.click(); }, sel: ".afp-dlg #afp-rows", t: "Ajuste à vontade", d: "Ativos, doses, via e forma são editáveis. A fórmula original da lâmina não muda." },
      { act: function () { var b = document.querySelector(".afp-dlg [data-save]"); if (b) { b.click(); simulou = true; } }, go: "prescrever", sel: ".afp-cart", t: "Pronto, está na receita", d: "Adicionamos por você. Aqui você revisa, edita ou remove cada item." },
      { sel: "#afp-pac", t: "Paciente", d: "Escolha do cadastro ou digite o nome. Ao lado, a prévia com os seus dados e o seu logo." },
      { sel: "#afp-envio", alt: "#afp-print", t: "Concluir", d: "Envie para uma farmácia parceira ou para o paciente (e-mail ou WhatsApp), imprima ou salve em PDF." },
      { sel: ".afp-conta", alt: ".afp-sair", t: "Seu perfil", d: "Dados do consultório e saída da conta. Para rever este tour, use o Início. Pronto!" }
    ];
    var ov = document.createElement("div"); ov.className = "afp-tour";
    ov.innerHTML = '<div class="afp-tour-hole"></div><div class="afp-tour-tip" role="dialog" aria-live="polite"><span class="afp-tour-n"></span><b></b><p></p><div class="afp-tour-bt"><button type="button" class="afp-link" data-skip>Pular</button><button type="button" class="afp-btn" data-next>Próximo</button></div></div>';
    document.body.appendChild(ov);
    var hole = ov.querySelector(".afp-tour-hole"), tip = ov.querySelector(".afp-tour-tip"), cur = null, i = -1;
    function place() {
      if (!cur) return; var r = cur.getBoundingClientRect(), pad = 8;
      hole.style.cssText = "top:" + (r.top - pad) + "px;left:" + (r.left - pad) + "px;width:" + (r.width + pad * 2) + "px;height:" + (r.height + pad * 2) + "px";
      var tw = Math.min(360, innerWidth - 32), th = tip.offsetHeight, below = r.bottom + pad + 14, x = Math.max(16, Math.min(r.left, innerWidth - tw - 16));
      var y = below + th < innerHeight - 16 ? below : Math.max(16, r.top - pad - 14 - th);
      if (y + th > innerHeight - 16) y = innerHeight - th - 16;
      tip.style.cssText = "width:" + tw + "px;left:" + x + "px;top:" + y + "px";
    }
    function fim() {
      removeEventListener("scroll", onScroll, true); removeEventListener("resize", onScroll); removeEventListener("keydown", onKey);
      ov.remove(); var m = document.querySelector(".afp-modal"); if (m) m.remove();
      if (simulou && S.rx.length > rxAntes) { S.rx.length = rxAntes; saveRx(); }
      lsSet(LS_TOUR, true); S.tourOn = false; S.tab = "inicio"; render(); window.scrollTo({ top: 0, behavior: "smooth" });
    }
    function passo() {
      i++; if (i >= steps.length) return fim();
      var st = steps[i], p = Promise.resolve(); ocupado = true;
      if (st.act) p = p.then(function () { st.act(); return wait(180); });
      if (st.go) p = p.then(function () { var m = document.querySelector(".afp-modal"); if (m) m.remove(); S.tab = st.go; render(); return wait(120); });
      p.then(function () {
        var vis = function (q) { var e = q && document.querySelector(q); return e && e.getClientRects().length ? e : null; };
        cur = vis(st.sel) || vis(st.alt);
        if (!cur) return passo();
        var r = cur.getBoundingClientRect(), dentro = r.top >= 70 && r.bottom <= innerHeight - 40;
        if (!dentro) { if (!cur.closest(".afp-modal")) window.scrollTo({ top: Math.max(0, r.top + scrollY - Math.max(110, (innerHeight - r.height) / 2 - 60)), behavior: "smooth" }); else cur.scrollIntoView({ block: "center", behavior: "smooth" }); }
        return wait(dentro ? 0 : 320).then(function () {
          tip.querySelector(".afp-tour-n").textContent = (i + 1) + " de " + steps.length;
          tip.querySelector("b").textContent = st.t; tip.querySelector("p").textContent = st.d;
          tip.querySelector("[data-next]").textContent = i === steps.length - 1 ? "Começar" : "Próximo";
          place(); ocupado = false;
        });
      });
    }
    var ocupado = false;
    ov.querySelector("[data-next]").addEventListener("click", function () { if (!ocupado) passo(); });
    ov.querySelector("[data-skip]").addEventListener("click", fim);
    var raf = 0; function onScroll() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; place(); }); }
    function onKey(e) { if (e.key === "Escape") fim(); }
    addEventListener("scroll", onScroll, { capture: true, passive: true }); addEventListener("resize", onScroll); addEventListener("keydown", onKey);
    passo();
  }

  function render() {
    var nav = [
      ["inicio", "inicio", "Início", "Visão geral"],
      ["formulas", "formulas", "Formulações", "Fórmulas por condição"],
      ["minhas", "editar", "Meu receituário", (S.minhas || []).length ? (S.minhas.length + " fórmula" + (S.minhas.length > 1 ? "s" : "") + " sua" + (S.minhas.length > 1 ? "s" : "")) : "Seus protocolos"],
      ["laminas", "laminas", "Lâminas técnicas", "Material completo"],
      ["prescrever", "prescrever", "Prescrever", S.rx.length ? S.rx.length + " na receita" : "Monte a receita"],
      ["pacientes", "paciente", "Pacientes", pacientes().length ? pacientes().length + " cadastrado" + (pacientes().length > 1 ? "s" : "") : "Cadastro e histórico"],
      ["farmacias", "loja", "Farmácias parceiras", farmacias().length ? farmacias().length + " cadastrada" + (farmacias().length > 1 ? "s" : "") : "Para enviar a receita"],
      ["receituario", "receituario", "Modelo da receita", "Logo, dados e rodapé"]
    ];
    var nome = (S.cfg && S.cfg.nome) || S.access.nome || "";
    var top = '<header class="afp-top"><div><p class="afp-eyebrow">Portal do prescritor</p><h1>Olá, <em>' + esc(nome.split(" ").slice(0, 2).join(" ")) + "</em></h1>" +
      '<p class="afp-top-sub">' + esc([S.cfg && S.cfg.registro, S.cfg && S.cfg.especialidade].filter(Boolean).join(" · ")) + "</p></div>" +
      '<button class="afp-ghost afp-sair" data-sair>' + ic("sair", 16) + ' Sair</button></header>';
    var ini = nome.split(" ").filter(Boolean).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join("") || "?";
    var conta = '<div class="afp-conta"><div class="afp-conta-id"><span class="afp-av">' + esc(ini) + '</span><span><b>' + esc(nome.split(" ").slice(0, 2).join(" ")) + '</b><small>' + esc((S.cfg && S.cfg.registro) || "Prescritor") + '</small></span></div>' +
      '<button type="button" class="afp-conta-bt" data-perfil>' + ic("editar", 16) + ' Meu perfil e consultório</button>' +
      '<button type="button" class="afp-conta-bt afp-conta-out" data-sair>' + ic("sair", 16) + ' Sair da conta</button></div>';
    S.el.innerHTML = top + '<div class="afp-shell"><aside class="afp-side"><nav>' + nav.map(function (t) {
      return '<button class="afp-nav" aria-current="' + (S.tab === t[0]) + '" data-tab="' + t[0] + '"><span class="afp-navic">' + ic(t[1]) + "</span>" +
        "<span><b>" + esc(t[2]) + "</b><small>" + esc(t[3]) + "</small></span>" +
        (t[0] === "prescrever" && S.rx.length ? '<i class="afp-badge">' + S.rx.length + "</i>" : "") + "</button>";
    }).join("") + '</nav>' + conta + '<p class="afp-aviso">' + ic("escudo", 16) + "<span>Material exclusivo para prescritores habilitados (RDC 67/2007, item 5.14).</span></p></aside>" +
      '<section class="afp-main" id="afp-view"></section></div>';
    S.el.querySelectorAll("[data-tab]").forEach(function (b) {
      b.addEventListener("click", function () { S.tab = b.getAttribute("data-tab"); S.open = null; render(); window.scrollTo({ top: S.el.getBoundingClientRect().top + scrollY - 90, behavior: "smooth" }); });
    });
    S.el.querySelectorAll("[data-sair]").forEach(function (sair) { sair.addEventListener("click", function () { var b = document.getElementById("pa-sair"); if (b) b.click(); }); });
    var pf = S.el.querySelector("[data-perfil]"); if (pf) pf.addEventListener("click", function () { S.tab = "receituario"; S.open = null; render(); window.scrollTo({ top: S.el.getBoundingClientRect().top + scrollY - 90, behavior: "smooth" }); });
    var v = S.el.querySelector("#afp-view");
    ({ inicio: viewInicio, formulas: viewFormulas, minhas: viewMinhas, laminas: viewLaminas, prescrever: viewPrescrever, pacientes: viewPacientes, farmacias: viewFarmacias, receituario: viewReceituario })[S.tab](v);
    carrinho();
    if (S.tab === "inicio" && !S.tourOn && !S.tourVisto && (TOUR_SEMPRE || !lsGet(LS_TOUR, false))) { S.tourVisto = true; setTimeout(tour, 600); }
  }
  function head(t, p, extra) { t = t.replace(/\*(.+?)\*/g, "<em>$1</em>"); return '<header class="afp-vh"><div><h2>' + t + "</h2>" + (p ? "<p>" + p + "</p>" : "") + "</div>" + (extra || "") + "</header>"; }

  /* ---------- helpers de fórmula ---------- */
  function lamina(n) { return S.laminas.filter(function (x) { return x.n === n; })[0]; }
  function original(key) {
    if (!key) return null;
    if (key.indexOf("m:") === 0) { var id = key.slice(2), mf = (S.minhas || []).filter(function (x) { return x.id === id; })[0]; return mf ? { l: MINHA_L, f: mf } : null; }
    var p = key.split(":"), l = lamina(p[0]); return l && l.formulas[+p[1]] ? { l: l, f: l.formulas[+p[1]] } : null;
  }
  function isBase(a) { return /^(excipiente|base\b|ve[ií]culo)/i.test(a || "") || /qsp/i.test(a || ""); }
  function ativos(f) { return (f.componentes || []).filter(function (c) { return !isBase(c.ativo); }).map(function (c) { return (c.ativo || "").replace(/\s*\(.*?\)/g, "").trim(); }); }
  function doses(f) {
    var q = f.quantidade || "", m = q.match(/(\d+)\s*(doses?|c[áa]psulas?|sach[êe]s?|unidades?)/i);
    if (m) return m[1] + " " + m[2].toLowerCase();
    m = q.match(/(\d+[.,]?\d*\s*(g|ml|mL))\b/); return m ? m[1] : "";
  }
  function viaLabel(f) { return f.via ? "Uso " + f.via.toLowerCase().replace(/(ic|ér|érm)a\b/, "$1o").replace(/ica\b/, "ico") : ""; }
  function copia(key) {
    var o = original(key).f;
    var fq = (o.quantidade || "").match(/\(([^)]+)\)/), forma = o.forma || (fq && formaDe(fq[1]) ? fq[1] : "");
    return { src: key, nome: o.nome, indicacao: o.indicacao || "", tags: (o.tags || []).slice(), forma: forma, via: o.via || "", componentes: (o.componentes || []).map(function (c) { return { ativo: c.ativo, dose: c.dose }; }), quantidade: o.quantidade || "", posologia: o.posologia || "" };
  }
  function naReceita(key) { return S.rx.some(function (r) { return r.src === key; }); }

  /* ---------- editor (pop-up) ---------- */
  function editor(item, idx) {
    // item = cópia editável; idx = posição na receita (null = novo)
    var src = original(item.src), l = src && src.l, f = JSON.parse(JSON.stringify(item));
    var modo = !item.src ? "nova" : item.src.indexOf("m:") === 0 ? "minha" : "lamina";
    var d = document.createElement("div"); d.className = "afp-modal";
    function rows() {
      return f.componentes.map(function (c, i) {
        return '<div class="afp-row"><input class="afp-in" data-k="ativo" data-i="' + i + '" value="' + esc(c.ativo) + '" aria-label="Ativo">' +
          '<input class="afp-in afp-in-dose" data-k="dose" data-i="' + i + '" value="' + esc(c.dose) + '" aria-label="Dose">' +
          '<button class="afp-icbtn" data-rm="' + i + '" aria-label="Remover ativo">' + ic("x", 16) + "</button></div>";
      }).join("");
    }
    d.innerHTML = '<div class="afp-dlg" role="dialog" aria-modal="true" aria-label="Editar fórmula">' +
      '<header class="afp-dlg-h"><div><span class="afp-tag">' + esc(modo === "nova" ? "Nova fórmula" : l ? l.titulo : "") + '</span><input class="afp-title-in" data-f="nome" value="' + esc(f.nome) + '" placeholder="Nome da fórmula" aria-label="Nome da fórmula"></div>' +
      '<button class="afp-icbtn" data-close aria-label="Fechar">' + ic("x") + "</button></header>" +
      '<div class="afp-dlg-b">' +
      (modo === "lamina" && src.f.indicacao ? '<p class="afp-ind">' + esc(src.f.indicacao) + "</p>" : "") +
      (modo !== "lamina" ? '<label class="afp-full"><span>Indicação / descrição curta</span><input class="afp-in" data-f="indicacao" value="' + esc(f.indicacao || "") + '" placeholder="Ex.: dor articular crônica"></label>' +
        '<label class="afp-full"><span>Tags para achar depois (separe por vírgula)</span><input class="afp-in" data-tags value="' + esc((f.tags || []).join(", ")) + '" placeholder="Ex.: articulações, dor, inflamação"></label>' : "") +
      '<div class="afp-forma" id="afp-forma"></div>' +
      '<div class="afp-comp-h"><span>Ativo</span><span>Dose</span></div><div id="afp-rows">' + rows() + "</div>" +
      '<button class="afp-ghost" data-addrow>' + ic("mais", 16) + " Adicionar ativo</button>" +
      '<label class="afp-full"><span>Quantidade</span><input class="afp-in" data-f="quantidade" value="' + esc(f.quantidade) + '" placeholder="ex.: Fazer 30 doses"></label>' +
      '<label class="afp-full"><span>Posologia</span><textarea class="afp-in" data-f="posologia" rows="2">' + esc(f.posologia) + "</textarea></label>" +
      '<div class="afp-pos" id="afp-pos"></div>' +
      (src && src.f.observacoes ? '<p class="afp-obs">' + esc(src.f.observacoes) + "</p>" : "") +
      (modo === "lamina" ? (function () {
        var o = src.f, chips = [];
        tagsUso(o).forEach(function (t) { chips.push('<button type="button" class="afp-tagchip" data-tag="' + esc(t) + '">' + esc(t) + "</button>"); });
        ativos(o).forEach(function (t) { chips.push('<button type="button" class="afp-tagchip afp-tag-at" data-tag="' + esc(t) + '">' + esc(t) + "</button>"); });
        var rel = relacionadas(item.src, 4);
        return '<div class="afp-relbox"><p class="afp-fg">Relacionado a</p><div class="afp-tags">' + chips.join("") +
          '<button type="button" class="afp-tagchip afp-tag-lam" data-lamtag>' + esc(src.l.titulo) + "</button></div>" +
          (rel.length ? '<p class="afp-fg">Fórmulas relacionadas</p><div class="afp-rel">' + rel.map(function (r) {
            return '<button type="button" class="afp-relit" data-relk="' + esc(r.key) + '"><b>' + esc(r.f.nome) + "</b><small>" + esc(r.l.titulo) + "</small></button>";
          }).join("") + "</div>" : "") + "</div>";
      })() : "") +
      "</div>" +
      '<div class="afp-val" id="afp-val" aria-live="polite"></div>' +
      '<footer class="afp-dlg-f">' + (modo === "lamina" ? '<button class="afp-link" data-lam>' + ic("laminas", 16) + " Ver lâmina</button>" : "<span></span>") +
      '<div class="afp-dlg-fa">' + (item.src ? '<button class="afp-ghost" data-reset title="Voltar ao original">Redefinir</button>' : "") +
      (modo === "minha" ? '<button class="afp-link afp-del" data-del>' + ic("lixo", 16) + " Excluir</button>" : "") + '<button class="afp-ghost" data-minha>' + ic("editar", 16) + (modo === "minha" ? " Atualizar no meu receituário" : " Salvar no meu receituário") + "</button>" +
      '<button class="afp-btn" data-save>' + ic(idx != null ? "ok" : "mais", 18) + (idx != null ? " Salvar na receita" : " Adicionar à receita") + "</button></div></footer></div>";
    document.body.appendChild(d); document.body.classList.add("afp-lock");
    function close() { d.remove(); document.body.classList.remove("afp-lock"); document.removeEventListener("keydown", k); }
    function k(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", k);
    function wireRows() {
      d.querySelectorAll("[data-i]").forEach(function (inp) { inp.addEventListener("input", function () { f.componentes[+inp.getAttribute("data-i")][inp.getAttribute("data-k")] = inp.value; }); });
      d.querySelectorAll("[data-rm]").forEach(function (b) { b.addEventListener("click", function () { f.componentes.splice(+b.getAttribute("data-rm"), 1); d.querySelector("#afp-rows").innerHTML = rows(); wireRows(); }); });
    }
    wireRows();
    // seletor de forma farmacêutica — fechado por padrão; mantém a forma que vem da fórmula
    var aberto = !f.forma && modo === "nova", sug = f.src ? copia(f.src) : { forma: "", via: "" };
    function mudou() { return (f.forma || "") !== (sug.forma || "") || (f.via || "") !== (sug.via || ""); }
    function formaUI() {
      var cur = formaDe(f.forma), box = d.querySelector("#afp-forma");
      box.innerHTML = '<div class="afp-forma-cur">' + foto(cur || "outra", 46) +
        '<div class="afp-forma-txt"><small>Forma farmacêutica</small><b>' + (esc(f.forma) || "Não informada na lâmina") + "</b>" + (f.via ? "<span>" + esc(viaLabel(f)) + "</span>" : "") + "</div>" +
        (mudou() ? '<button type="button" class="afp-link afp-reset" data-freset title="Voltar para a forma sugerida na lâmina">Redefinir</button>' : "") + '<button type="button" class="afp-ghost" data-ftog>' + (aberto ? "Fechar" : f.forma ? "Alterar" : "Escolher forma") + "</button></div>" +
        (aberto ? '<div class="afp-forma-pick"><div class="afp-two"><label><span>Forma (escreva ou escolha abaixo)</span><input class="afp-in" data-f2="forma" value="' + esc(f.forma) + '"></label>' +
          '<label><span>Via de uso</span><select class="afp-in" data-f2="via"><option value="">Escolha a via</option>' + VIAS.filter(function (o) { return !(ehNutri() && grupoVia(o[0]) === "topica"); }).map(function (o) { return '<option value="' + o[0] + '"' + (grupoVia(f.via) && norm(f.via).indexOf(norm(o[0]).slice(0, 4)) === 0 ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") +
          (f.via && !VIAS.some(function (o) { return norm(f.via).indexOf(norm(o[0]).slice(0, 4)) === 0; }) ? '<option selected value="' + esc(f.via) + '">' + esc(f.via) + "</option>" : "") + "</select></label></div>" +
          (grupoVia(f.via) ? '<p class="afp-hint afp-viahint">' + ic("escudo", 14) + "Mostrando só formas de " + esc(GRUPO_NOME[grupoVia(f.via)] || "uso " + f.via) + ". Para outra forma, troque a via.</p>" : "") +
          FORMAS.map(function (g) {
            var itens = g.itens.filter(function (i) { return (!grupoVia(f.via) || grupoVia(i[2]) === grupoVia(f.via)) && !(ehNutri() && grupoVia(i[2]) === "topica"); });
            if (!itens.length) return "";
            return '<p class="afp-fg">' + esc(g.g) + '</p><div class="afp-fgrid">' + itens.map(function (i) {
              return '<button type="button" class="afp-fopt" aria-pressed="' + (cur === i[0]) + '" data-fo="' + i[0] + '">' + foto(i[0], 52) + "<span>" + esc(i[1]) + "</span></button>";
            }).join("") + "</div>";
          }).join("") + "</div>" : "");
      var fr = box.querySelector("[data-freset]"); if (fr) fr.addEventListener("click", function () { f.forma = sug.forma; f.via = sug.via; aberto = false; formaUI(); });
      box.querySelector("[data-ftog]").addEventListener("click", function () { aberto = !aberto; formaUI(); });
      box.querySelectorAll("[data-f2]").forEach(function (inp) { inp.addEventListener("change", function () {
        var k = inp.getAttribute("data-f2"); f[k] = inp.value;
        if (k === "via" && conflitoVia(f)) { f.forma = ""; aberto = true; }   // via nova não combina com a forma: obriga a escolher de novo
        formaUI(); posUI();
      }); });
      box.querySelectorAll("[data-fo]").forEach(function (b) { b.addEventListener("click", function () {
        var it = FORMA_LIST.filter(function (x) { return x.id === b.getAttribute("data-fo"); })[0];
        f.forma = it.nome.replace(/\s*\(.*?\)/, ""); if (!grupoVia(f.via) || grupoVia(f.via) !== grupoVia(it.via)) f.via = it.via; aberto = false; formaUI(); posUI();
      }); });
    }
    formaUI();
    function posUI() {
      var box = d.querySelector("#afp-pos"), sg = posSugestoes(f), ta = d.querySelector('[data-f="posologia"]');
      box.innerHTML = '<span class="afp-pos-l">Posologia rápida</span>' +
        sg.minhas.map(function (p, i) { return '<span class="afp-poschip minha"><button type="button" data-pos="' + esc(p) + '">' + esc(p) + '</button><button type="button" class="afp-posx" data-posx="' + i + '" aria-label="Remover atalho">' + ic("x", 12) + "</button></span>"; }).join("") +
        sg.base.map(function (p) { return '<button type="button" class="afp-poschip" data-pos="' + esc(p) + '">' + esc(p) + "</button>"; }).join("") +
        '<button type="button" class="afp-link" data-possave>' + ic("mais", 14) + " Salvar a posologia atual como atalho</button>";
      box.querySelectorAll("[data-pos]").forEach(function (b) { b.addEventListener("click", function () { ta.value = b.getAttribute("data-pos"); f.posologia = ta.value; ta.classList.remove("afp-bad"); }); });
      box.querySelectorAll("[data-posx]").forEach(function (b) { b.addEventListener("click", function () { var l = lsU(LS_POS, []); l.splice(+b.getAttribute("data-posx"), 1); lsUSet(LS_POS, l); posUI(); }); });
      box.querySelector("[data-possave]").addEventListener("click", function () {
        var t = (ta.value || "").trim(); if (t.length < 4) { ta.classList.add("afp-bad"); ta.focus(); return; }
        var l = lsU(LS_POS, []); if (l.indexOf(t) < 0) { l.unshift(t); lsUSet(LS_POS, l.slice(0, 20)); } posUI(); toast("Posologia salva como atalho");
      });
    }
    posUI();
    d.querySelectorAll("[data-f]").forEach(function (inp) { inp.addEventListener("input", function () { f[inp.getAttribute("data-f")] = inp.value; }); });
    d.querySelector("[data-addrow]").addEventListener("click", function () { f.componentes.push({ ativo: "", dose: "" }); d.querySelector("#afp-rows").innerHTML = rows(); wireRows(); var ins = d.querySelectorAll('[data-k="ativo"]'); ins[ins.length - 1].focus(); });
    d.addEventListener("click", function (e) { if (e.target === d || e.target.closest("[data-close]")) close(); });
    d.addEventListener("input", function (e) { if (e.target.classList) e.target.classList.remove("afp-bad"); });
    var ti = d.querySelector("[data-tags]"); if (ti) ti.addEventListener("input", function () { f.tags = ti.value.split(",").map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean).slice(0, 12); });
    var confirmado = "";
    function checar(acao) {
      var v = validar(f), box = d.querySelector("#afp-val");
      d.querySelectorAll(".afp-bad").forEach(function (x) { x.classList.remove("afp-bad"); });
      if (!(f.nome || "").trim() || f.nome.trim().length < 3) d.querySelector(".afp-title-in").classList.add("afp-bad");
      d.querySelectorAll('[data-k="dose"]').forEach(function (x) { if (!x.value.trim() && d.querySelector('[data-k="ativo"][data-i="' + x.getAttribute("data-i") + '"]').value.trim()) x.classList.add("afp-bad"); });
      ["quantidade", "posologia"].forEach(function (k) { var x = d.querySelector('[data-f="' + k + '"]'); if (x && !x.value.trim()) x.classList.add("afp-bad"); });
      var fbox = d.querySelector("#afp-forma");
      if (!(f.forma || "").trim() || conflitoVia(f)) { fbox.classList.add("afp-bad"); if (!aberto) { aberto = true; formaUI(); } fbox.scrollIntoView({ block: "center", behavior: "smooth" }); }
      else fbox.classList.remove("afp-bad");
      if (v.erros.length) { box.innerHTML = '<div class="afp-val-err"><b>Antes de continuar:</b><ul>' + v.erros.map(function (e) { return "<li>" + esc(e) + "</li>"; }).join("") + "</ul></div>"; confirmado = ""; return false; }
      if (v.avisos.length && confirmado !== acao) {
        box.innerHTML = '<div class="afp-val-av"><b>Confira antes de seguir</b> (clique de novo para confirmar):<ul>' + v.avisos.map(function (e) { return "<li>" + esc(e) + "</li>"; }).join("") + "</ul></div>";
        confirmado = acao; return false;
      }
      box.innerHTML = ""; return true;
    }
    d.querySelector("[data-save]").addEventListener("click", function () {
      if (!checar("rx")) return;
      f.componentes = f.componentes.filter(function (c) { return (c.ativo || "").trim(); });
      if (idx != null) S.rx[idx] = f; else S.rx.push(f);
      saveRx(); close(); render(); toast(idx != null ? "Fórmula atualizada" : "Adicionada à receita");
    });
    d.querySelector("[data-minha]").addEventListener("click", function () {
      if (!checar("minha")) return;
      f.componentes = f.componentes.filter(function (c) { return (c.ativo || "").trim(); });
      var lista = (S.minhas || []).slice(), id = modo === "minha" ? item.src.slice(2) : novoId();
      var reg = { id: id, nome: f.nome.trim(), indicacao: (f.indicacao || "").trim(), forma: f.forma, via: f.via, componentes: f.componentes, quantidade: f.quantidade, posologia: f.posologia,
        tags: (f.tags && f.tags.length ? f.tags : tagsUso((src && src.f) || {})).slice(0, 12), criadaEm: new Date().toISOString().slice(0, 10) };
      var i = lista.map(function (x) { return x.id; }).indexOf(id);
      if (i > -1) lista[i] = reg; else { if (lista.length >= 300) { d.querySelector("#afp-val").innerHTML = '<div class="afp-val-err">Limite de 300 fórmulas próprias atingido.</div>'; return; } lista.unshift(reg); }
      var b = this; b.disabled = true;
      salvarMinhas(lista).then(function () { close(); render(); toast(i > -1 ? "Atualizada no meu receituário" : "Salva no meu receituário"); })
        .catch(function () { b.disabled = false; d.querySelector("#afp-val").innerHTML = '<div class="afp-val-err">Não foi possível salvar agora. Tente de novo.</div>'; });
    });
    wireTags(d, close);
    var del = d.querySelector("[data-del]"); if (del) del.addEventListener("click", function () {
      if (!confirm("Excluir esta fórmula do meu receituário?")) return;
      salvarMinhas((S.minhas || []).filter(function (x) { return x.id !== item.src.slice(2); })).then(function () { close(); render(); toast("Fórmula excluída"); });
    });
    var lt = d.querySelector("[data-lamtag]"); if (lt) lt.addEventListener("click", function () { close(); S.tab = "laminas"; S.open = src.l.n; render(); });
    d.querySelectorAll("[data-relk]").forEach(function (b) { b.addEventListener("click", function () { close(); editor(copia(b.getAttribute("data-relk")), null); }); });
    var rs = d.querySelector("[data-reset]"); if (rs) rs.addEventListener("click", function () { close(); editor(copia(item.src), idx); });
    var lm = d.querySelector("[data-lam]"); if (lm) lm.addEventListener("click", function () { close(); S.tab = "laminas"; S.open = l.n; render(); });
    d.querySelector(".afp-title-in").focus();
  }
  function toast(t) {
    var n = document.createElement("div"); n.className = "afp-toast"; n.innerHTML = ic("ok", 16) + esc(t);
    document.body.appendChild(n); setTimeout(function () { n.classList.add("out"); }, 1800); setTimeout(function () { n.remove(); }, 2200);
  }

  /* ---------- tags ---------- */
  function tagsUso(f) { return f.tags || []; }
  function buscarTag(t) { var tg = tagsUso({ tags: [t] })[0]; var ehTag = todas().some(function (it) { return it.x.tags.indexOf(norm(t)) > -1; }); if (ehTag) { S.f.tag = t; S.q = ""; } else { S.q = t; S.f.tag = null; } S.f.esp = null; S.tab = "formulas"; S.lim = 48; render(); }
  function relacionadas(key, n) {
    var o = original(key); if (!o) return [];
    var tg = tagsUso(o.f).map(norm), at = ativos(o.f).map(norm);
    return todas().filter(function (it) { return it.key !== key; }).map(function (it) {
      var sc = 0;
      tagsUso(it.f).forEach(function (t) { if (tg.indexOf(norm(t)) > -1) sc += 2; });
      ativos(it.f).forEach(function (a) { if (at.indexOf(norm(a)) > -1) sc += 1; });
      return { it: it, sc: sc };
    }).filter(function (x) { return x.sc >= 3; }).sort(function (a, b) { return b.sc - a.sc; }).slice(0, n || 4).map(function (x) { return x.it; });
  }

  /* ---------- formulações: índice, busca e filtros ---------- */
  // Fonte única: fórmulas das lâminas + "Minhas fórmulas" (chave "m:<id>"). Índice normalizado montado 1x por mudança.
  var MINHA_L = { n: "m", titulo: "Meu receituário", especialidade: "Meu receituário", condicoes: [] };
  var IDX = null;
  function invalidar() { IDX = null; }
  function todas() {
    if (IDX) return IDX;
    var out = [];
    S.laminas.forEach(function (l) { (l.formulas || []).forEach(function (f, i) { out.push({ l: l, f: f, key: l.n + ":" + i, minha: false }); }); });
    (S.minhas || []).forEach(function (f) { out.push({ l: MINHA_L, f: f, key: "m:" + f.id, minha: true }); });
    out.forEach(function (it) {
      var f = it.f, fm = formaDe(f.forma) || formaDe(f.quantidade);
      it.x = {
        nome: norm(f.nome), tags: tagsUso(f).map(norm), ativos: ativos(f).map(norm),
        cond: norm(it.l.titulo), ind: norm(f.indicacao),
        forma: fm || "", via: norm(f.via || (FORMA_LIST.filter(function (x) { return x.id === fm; })[0] || {}).via || ""),
        esp: it.l.especialidade || "Outras"
      };
    });
    return (IDX = out);
  }
  // Pontuação: todo termo precisa aparecer (E); nome pesa mais que tag, que pesa mais que ativo.
  function pontuar(it, termos) {
    var x = it.x, total = 0;
    for (var i = 0; i < termos.length; i++) {
      var t = termos[i], s = 0;
      if (x.nome.indexOf(t) > -1) s += (x.nome.indexOf(t) === 0 || x.nome.indexOf(" " + t) > -1) ? 10 : 7;
      if (x.tags.some(function (g) { return g.indexOf(t) > -1; })) s += 5;
      if (x.ativos.some(function (a) { return a.indexOf(t) > -1; })) s += 4;
      if (x.cond.indexOf(t) > -1) s += 2;
      if (x.ind.indexOf(t) > -1) s += 1;
      if (!s) return 0;
      total += s;
    }
    return total || 1;
  }
  function sugestoes() {
    var cont = {};
    todas().forEach(function (it) {
      tagsUso(it.f).concat(ativos(it.f)).forEach(function (t) { var k = t.toLowerCase(); cont[k] = (cont[k] || 0) + 1; });
    });
    return Object.keys(cont).sort(function (a, b) { return cont[b] - cont[a]; }).slice(0, 400);
  }
  function topTags() {
    var c = {}; todas().forEach(function (it) { tagsUso(it.f).forEach(function (t) { c[t] = (c[t] || 0) + 1; }); });
    return Object.keys(c).sort(function (a, b) { return c[b] - c[a] || a.localeCompare(b); }).slice(0, 40).map(function (t) { return [t, c[t]]; });
  }
  S.f = { esp: null, forma: null, via: null, tag: null, origem: "todas" }; S.ordem = "rel"; S.lim = 48;
  function filtrar() {
    var termos = norm(S.q).split(/[\s,;]+/).filter(function (t) { return t.length > 1; });
    var r = [];
    todas().forEach(function (it) {
      var x = it.x;
      if (S.f.origem === "minhas" && !it.minha) return;
      if (S.f.origem === "laminas" && it.minha) return;
      if (S.f.esp && x.esp !== S.f.esp) return;
      if (S.f.forma && x.forma !== S.f.forma) return;
      if (S.f.via && x.via.indexOf(norm(S.f.via)) !== 0) return;
      if (S.f.tag && x.tags.indexOf(norm(S.f.tag)) < 0) return;
      if (ehNutri() && grupoVia(x.via || (FORMA_LIST.filter(function (y) { return y.id === x.forma; })[0] || {}).via) === "topica") return;   // CRN não prescreve uso tópico
      var sc = termos.length ? pontuar(it, termos) : 1;
      if (sc) r.push({ it: it, sc: sc });
    });
    if (S.ordem === "az") r.sort(function (a, b) { return a.it.x.nome.localeCompare(b.it.x.nome); });
    else if (S.ordem === "lamina") r.sort(function (a, b) { return String(a.it.l.n).localeCompare(String(b.it.l.n)) || a.it.x.nome.localeCompare(b.it.x.nome); });
    else r.sort(function (a, b) { return b.sc - a.sc || a.it.x.nome.localeCompare(b.it.x.nome); });
    return r.map(function (x) { return x.it; });
  }
  function card(it) {
    var f = it.f, on = naReceita(it.key), at = ativos(f), ds = doses(f), fm = formaDe(f.forma) || formaDe(f.quantidade);
    return '<article class="afp-card' + (on ? " on" : "") + (it.minha ? " minha" : "") + '" data-det="' + it.key + '" tabindex="0">' +
      '<span class="afp-tag">' + (it.minha ? ic("editar", 12) + " Minha fórmula" : esc(it.l.especialidade || "")) + "</span>" +
      "<h3>" + esc(f.nome) + "</h3>" +
      (f.indicacao ? '<p class="afp-ind">' + esc(f.indicacao) + "</p>" : "") +
      (tagsUso(f).length ? '<div class="afp-tags">' + tagsUso(f).slice(0, 3).map(function (t) { return '<button type="button" class="afp-tagchip" data-tag="' + esc(t) + '">' + esc(t) + "</button>"; }).join("") + "</div>" : "") +
      (at.length ? '<p class="afp-at">' + esc(at.slice(0, 3).join(" · ")) + (at.length > 3 ? " <span>+" + (at.length - 3) + "</span>" : "") + "</p>" : "") +
      '<div class="afp-foot"><span class="afp-meta">' + (fm ? '<span class="afp-fbadge" title="' + esc(f.forma || "") + '">' + foto(fm, 30) + "</span>" : "") + (ds ? '<span class="afp-dose">' + esc(ds) + "</span>" : "") + "</span>" +
      '<span class="afp-cta">' + (on ? ic("ok", 16) + "Na receita" : ic("mais", 16) + "Prescrever") + "</span></div></article>";
  }
  function wireTags(root, after) {
    root.querySelectorAll("[data-tag]").forEach(function (b) { b.addEventListener("click", function (e) { e.stopPropagation(); if (after) after(); buscarTag(b.getAttribute("data-tag")); }); });
  }
  function wireCards(root) {
    wireTags(root);
    root.querySelectorAll("[data-det]").forEach(function (c) {
      var go = function () { editor(copia(c.getAttribute("data-det")), null); };
      c.addEventListener("click", go);
      c.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
    });
  }
  function viewFormulas(v, soMinhas) {
    if (soMinhas) S.f.origem = "minhas"; else if (S.f.origem === "minhas" && S.tab !== "minhas") S.f.origem = "todas";
    var lista = todas(), itens = filtrar(), vis = itens.slice(0, S.lim);
    var esps = []; lista.forEach(function (it) { if (!it.minha && esps.indexOf(it.x.esp) < 0) esps.push(it.x.esp); }); esps.sort();
    var formas = FORMA_LIST.filter(function (fo) { return lista.some(function (it) { return it.x.forma === fo.id; }); });
    var vias = []; lista.forEach(function (it) { var vv = it.x.via; if (vv && vias.indexOf(vv) < 0) vias.push(vv); }); vias.sort();
    var nMinhas = (S.minhas || []).length;
    var ativosF = [];
    if (S.f.esp) ativosF.push(["esp", S.f.esp]);
    if (S.f.forma) ativosF.push(["forma", (FORMA_LIST.filter(function (x) { return x.id === S.f.forma; })[0] || {}).nome]);
    if (S.f.via) ativosF.push(["via", "Uso " + S.f.via]);
    if (S.f.tag) ativosF.push(["tag", "#" + S.f.tag]);
    if (S.q) ativosF.push(["q", "“" + S.q + "”"]);
    function sel(id, rot, ops, val) {
      return '<label class="afp-sel"><span>' + rot + '</span><select class="afp-in" data-fsel="' + id + '"><option value="">Todas</option>' +
        ops.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (val === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select></label>";
    }
    v.innerHTML = (soMinhas
        ? head("Meu *receituário*", "Seus protocolos: fórmulas criadas por você ou variações salvas a partir das lâminas, com a sua posologia. Ficam guardadas na sua conta.",
            '<button class="afp-btn" data-nova>' + ic("mais", 18) + " Nova fórmula</button>")
        : head("Fórmulas por *condição*", "Busque por condição, ativo, tag ou nome. Combine filtros para chegar rápido na fórmula certa.",
            '<button class="afp-ghost" data-nova>' + ic("mais", 16) + " Criar fórmula</button>")) +
      '<div class="afp-tools">' +
      '<label class="afp-search">' + ic("busca", 18) + '<input type="search" list="afp-sug" autocomplete="off" placeholder="Ex.: artrite cúrcuma · enxaqueca · melasma tópico" value="' + esc(S.q) + '">' +
      (S.q ? '<button type="button" class="afp-icbtn" data-limpaq aria-label="Limpar busca">' + ic("x", 16) + "</button>" : "") + "</label>" +
      '<datalist id="afp-sug">' + sugestoes().map(function (t) { return '<option value="' + esc(t) + '">'; }).join("") + "</datalist>" +
      (soMinhas ? "" : '<div class="afp-chips"><button class="afp-chip" aria-pressed="' + !S.f.esp + '" data-e="">Todas as especialidades</button>' +
        esps.map(function (e) { return '<button class="afp-chip" aria-pressed="' + (S.f.esp === e) + '" data-e="' + esc(e) + '">' + esc(e) + "</button>"; }).join("") + "</div>") +
      '<div class="afp-filtros">' +
      (soMinhas ? "" : '<div class="afp-seg" role="group" aria-label="Origem">' + [["todas", "Todas"], ["laminas", "Das lâminas"], ["minhas", "Minhas (" + nMinhas + ")"]].map(function (o) {
        return '<button class="afp-seg-b" aria-pressed="' + (S.f.origem === o[0]) + '" data-org="' + o[0] + '">' + o[1] + "</button>"; }).join("") + "</div>") +
      sel("forma", "Forma", formas.map(function (fo) { return [fo.id, fo.nome]; }), S.f.forma) +
      sel("via", "Via", vias.map(function (x) { return [x, "Uso " + x]; }), S.f.via) +
      sel("tag", "Tag", topTags().map(function (t) { return [t[0], t[0] + " (" + t[1] + ")"]; }), S.f.tag) +
      sel("ordem", "Ordenar", [["rel", "Relevância"], ["az", "A–Z"], ["lamina", "Por lâmina"]], S.ordem).replace('<option value="">Todas</option>', "") +
      "</div>" +
      (ativosF.length ? '<div class="afp-ativos">' + ativosF.map(function (a) { return '<button class="afp-fchip" data-rmf="' + esc(a[0]) + '">' + esc(a[1]) + ic("x", 14) + "</button>"; }).join("") +
        '<button class="afp-link" data-limpatudo>Limpar filtros</button></div>' : "") +
      "</div>" +
      '<p class="afp-count"><b>' + itens.length + "</b> fórmula" + (itens.length === 1 ? "" : "s") + (itens.length !== lista.length && !soMinhas ? " de " + lista.length : "") + "</p>" +
      '<div class="afp-grid">' + (vis.map(card).join("") ||
        (soMinhas && !nMinhas
          ? '<div class="afp-emptybox">' + ic("editar", 32) + "<b>Você ainda não criou fórmulas</b><p>Crie do zero ou abra uma fórmula das lâminas, ajuste e use “Salvar no meu receituário”.</p>" + '<button class="afp-btn" data-nova>' + ic("mais", 18) + " Nova fórmula</button></div>"
          : '<div class="afp-emptybox">' + ic("busca", 30) + "<b>Nenhuma fórmula com esses critérios</b><p>Tente menos palavras, outro termo (ex.: o ativo ou a condição) ou limpe os filtros.</p>" + (ativosF.length ? '<button class="afp-ghost" data-limpatudo>Limpar filtros</button>' : "") + "</div>")) + "</div>" +
      (itens.length > vis.length ? '<div class="afp-mais"><button class="afp-ghost" data-mais>Mostrar mais ' + Math.min(48, itens.length - vis.length) + " de " + (itens.length - vis.length) + "</button></div>" : "");
    var inp = v.querySelector(".afp-search input"), tmr;
    inp.addEventListener("input", function () {
      clearTimeout(tmr); tmr = setTimeout(function () { S.q = inp.value; S.lim = 48; var p = inp.selectionStart; render(); var n = S.el.querySelector(".afp-search input"); n.focus(); n.setSelectionRange(p, p); }, 180);
    });
    function on(sel2, fn) { v.querySelectorAll(sel2).forEach(function (b) { b.addEventListener("click", fn.bind(null, b)); }); }
    on("[data-e]", function (b) { S.f.esp = b.getAttribute("data-e") || null; S.lim = 48; render(); });
    on("[data-org]", function (b) { S.f.origem = b.getAttribute("data-org"); S.lim = 48; render(); });
    v.querySelectorAll("[data-fsel]").forEach(function (s2) { s2.addEventListener("change", function () { var k = s2.getAttribute("data-fsel"); if (k === "ordem") S.ordem = s2.value || "rel"; else S.f[k] = s2.value || null; S.lim = 48; render(); }); });
    on("[data-rmf]", function (b) { var k = b.getAttribute("data-rmf"); if (k === "q") S.q = ""; else S.f[k] = null; render(); });
    on("[data-limpatudo]", function () { S.q = ""; S.f = { esp: null, forma: null, via: null, tag: null, origem: soMinhas ? "minhas" : "todas" }; render(); });
    on("[data-limpaq]", function () { S.q = ""; render(); });
    on("[data-mais]", function () { S.lim += 48; render(); });
    on("[data-nova]", function () { novaFormula(); });
    wireCards(v);
  }
  function viewMinhas(v) { viewFormulas(v, true); }
  function novaFormula() {
    editor({ src: null, nome: "", indicacao: "", forma: "", via: "", componentes: [{ ativo: "", dose: "" }], quantidade: "", posologia: "", tags: [] }, null);
  }

  /* ---------- validação à prova de erros ---------- */
  var UNID = /^(\d+([.,]\d+)?\s*(mg|g|mcg|µg|ug|ng|ui|%|ml|l|meq|gotas?|bilh(õ|o)es?(\s*de)?\s*ufc|milh(õ|o)es?(\s*de)?\s*ufc|ufc|mmol|cp|cps|c[áa]ps(ulas?)?)(\s*\/\s*\w+)?|qsp(\s*\d+([.,]\d+)?\s*(g|ml|mg))?|q\.?s\.?p\.?)$/i;
  var CONTROLADOS = ["tramadol", "codeína", "codeina", "morfina", "metadona", "oxicodona", "tapentadol", "clonazepam", "diazepam", "alprazolam", "lorazepam", "bromazepam", "zolpidem",
    "sibutramina", "anfepramona", "femproporex", "mazindol", "metilfenidato", "lisdexanfetamina", "testosterona", "oxandrolona", "nandrolona", "estanozolol", "gestrinona",
    "isotretinoína", "isotretinoina", "topiramato", "gabapentina", "pregabalina", "fluoxetina", "sertralina", "escitalopram", "citalopram", "paroxetina", "venlafaxina",
    "duloxetina", "bupropiona", "amitriptilina", "nortriptilina", "trazodona", "canabidiol", "cbd", "misoprostol", "carisoprodol", "ciclobenzaprina"];
  function validar(f) {
    var erros = [], avisos = [], vistos = {};
    if ((f.nome || "").trim().length < 3) erros.push("Dê um nome à fórmula (mínimo 3 letras).");
    if (!(f.forma || "").trim()) erros.push("Falta a forma farmacêutica: escolha uma no quadro “Forma farmacêutica” (destacado em vermelho acima dos ativos).");
    else if (conflitoVia(f)) erros.push(conflitoVia(f));
    if (ehNutri() && (grupoVia(f.via) === "topica" || (formaInfo(f.forma) && grupoVia(formaInfo(f.forma).via) === "topica"))) erros.push("Nutricionistas (CRN) não prescrevem fórmulas de uso tópico. Escolha uma forma de uso oral.");
    var comps = (f.componentes || []).filter(function (c) { return (c.ativo || "").trim(); });
    if (!comps.length) erros.push("Inclua pelo menos um ativo com dose.");
    comps.forEach(function (c) {
      var a = c.ativo.trim(), dz = (c.dose || "").trim(), k = norm(a);
      if (!dz) erros.push("Informe a dose de “" + a + "”.");
      else if (!UNID.test(dz)) avisos.push("Confira a dose de “" + a + "” (" + dz + "): unidade não reconhecida.");
      if (vistos[k]) avisos.push("“" + a + "” aparece mais de uma vez."); vistos[k] = 1;
      if (CONTROLADOS.some(function (x) { return k.indexOf(norm(x)) > -1; })) avisos.push("“" + a + "” pode estar sujeito a controle especial (Portaria 344/98): confira o tipo de receituário.");
    });
    if (!(f.quantidade || "").trim()) erros.push("Informe a quantidade (ex.: Fazer 30 doses).");
    if (!(f.posologia || "").trim()) erros.push("Informe a posologia.");
    return { erros: erros, avisos: avisos };
  }

  /* ---------- persistência de Minhas fórmulas ---------- */
  function novoId() { return "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function salvarMinhas(lista) {
    return S.getToken().then(function (t) {
      return fetch(API_URL, { method: "POST", headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" }, body: JSON.stringify({ minhas: lista }) });
    }).then(function (r) { if (!r.ok) throw r.status; S.minhas = lista; invalidar(); });
  }

  /* ---------- lâminas ---------- */
  function pagina(n, p) {
    var k = n + "-" + p;
    if (S.imgCache[k]) return Promise.resolve(S.imgCache[k]);
    return api("?img=" + encodeURIComponent(k)).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(function (b) { return (S.imgCache[k] = URL.createObjectURL(b)); });
  }
  function viewLaminas(v) {
    var l = S.open && lamina(S.open);
    if (l) {
      v.innerHTML = '<button class="afp-link afp-back" data-back>' + ic("voltar", 16) + " Todas as lâminas</button>" +
        head(esc(l.titulo), esc(l.resumo || ""), '<button class="afp-ghost" data-baixar>' + ic("upload", 16) + " Baixar lâmina (PDF)</button>") +
        '<div class="afp-lgrid"><div class="afp-pages">' +
        Array.from({ length: l.paginas || 0 }, function (_, i) { return '<figure class="afp-page" data-p="' + (i + 1) + '"><span>Página ' + (i + 1) + "</span></figure>"; }).join("") +
        '</div><aside class="afp-lside"><h3>Fórmulas desta lâmina <small>' + (l.formulas || []).length + "</small></h3>" +
        '<div class="afp-list">' + (l.formulas || []).map(function (f, i) {
          var k = l.n + ":" + i, ds = doses(f);
          return '<button class="afp-li' + (naReceita(k) ? " on" : "") + '" data-det="' + esc(k) + '"><span><b>' + esc(f.nome) + "</b><small>" + esc(ativos(f).slice(0, 3).join(" · ")) + (ds ? " — " + esc(ds) : "") + "</small></span>" + ic(naReceita(k) ? "ok" : "mais", 18) + "</button>";
        }).join("") + "</div>" +
        (l.contraindicacoes ? '<p class="afp-obs"><b>Contraindicações.</b> ' + esc(l.contraindicacoes) + "</p>" : "") + "</aside></div>";
      v.querySelector("[data-back]").addEventListener("click", function () { S.open = null; render(); });
      v.querySelector("[data-baixar]").addEventListener("click", function () { baixarLamina(l, this); });
      v.querySelectorAll(".afp-page").forEach(function (fig) {
        pagina(l.n, fig.getAttribute("data-p")).then(function (u) {
          var alt = l.titulo + " — página " + fig.getAttribute("data-p");
          fig.innerHTML = '<img alt="' + esc(alt) + '" src="' + u + '"><button type="button" class="afp-zbt" aria-label="Ampliar página">' + ic("busca", 16) + " Ampliar</button>";
          fig.addEventListener("click", function () { ampliar(u, alt); });
        })
          .catch(function () { fig.innerHTML = "<span>Página indisponível</span>"; });
      });
      wireCards(v);
      return;
    }
    v.innerHTML = head("Lâminas *técnicas*", "O material completo de cada linha, do jeito que foi aprovado.") +
      '<div class="afp-lcards">' + S.laminas.map(function (l) {
        return '<button class="afp-lcard" data-l="' + esc(l.n) + '"><figure data-thumb="' + l.n + '"></figure><span class="afp-tag">' + esc(l.especialidade || "") + "</span><b>" + esc(l.titulo) + "</b><small>" + (l.formulas || []).length + " fórmulas · " + (l.paginas || 0) + " páginas</small></button>";
      }).join("") + "</div>";
    v.querySelectorAll("[data-l]").forEach(function (b) { b.addEventListener("click", function () { S.open = b.getAttribute("data-l"); render(); }); });
    v.querySelectorAll("[data-thumb]").forEach(function (fig) { pagina(fig.getAttribute("data-thumb"), 1).then(function (u) { fig.innerHTML = '<img alt="" src="' + u + '">'; }).catch(function () {}); });
  }

  /* ---------- receita (A4) ---------- */
  function loja() { return S.lojas.filter(function (x) { return String(x.id) === String(S.cfg.farmaciaId); })[0]; }
  function hoje() { return new Date().toLocaleDateString("pt-BR"); }
  /* Receita A4 paginada: cada fórmula fica inteira numa página; se não couber, abre página nova.
     Mede numa folha real (794×1123 px = A4 a 96 dpi) fora da tela. Cabeçalho e rodapé em toda página. */
  function posLabel(p) {
    p = (p || "").trim(); if (!p) return "";
    var m = p.match(/^(posologia|modo de uso|modo de usar|uso|aplica[çc][ãa]o)\s*:?\s*/i);
    return m ? "<b>" + esc(p.slice(0, m[0].length).replace(/\s*:?\s*$/, "")) + ":</b> " + esc(p.slice(m[0].length))
             : "<b>Posologia:</b> " + esc(p.charAt(0).toUpperCase() + p.slice(1));
  }
  function itemHTML(f, n) {
    return '<li value="' + n + '">' + (viaLabel(f) ? '<div class="rx-via">' + esc(viaLabel(f)) + "</div>" : "") +
      '<div class="rx-fn">' + esc(f.nome) + (f.forma ? " — " + esc(f.forma) : "") + "</div>" +
      '<table class="rx-comp">' + (f.componentes || []).map(function (x) { return "<tr><td>" + esc(x.ativo) + "</td><td>" + esc(x.dose) + "</td></tr>"; }).join("") + "</table>" +
      (f.quantidade ? '<div class="rx-qsp">' + esc(f.quantidade) + "</div>" : "") +
      (f.posologia ? '<div class="rx-pos">' + posLabel(f.posologia) + "</div>" : "") + "</li>";
  }
  function folha(paciente, itens) {
    var c = S.cfg;
    itens = itens || S.rx;
    var head = '<header class="rx-head"><div><div class="rx-nome">' + esc(c.nome) + '</div><div class="rx-reg">' + esc([c.registro, c.especialidade].filter(Boolean).join(" · ")) + "</div></div>" +
      (c.logo ? '<img class="rx-logo" alt="" src="' + c.logo + '">' : "") + "</header>" +
      '<div class="rx-pac"><span>Paciente: <b>' + (esc(paciente) || "&nbsp;") + "</b></span><span>" + hoje() + "</span></div>";
    var fim = '<div class="rx-end"><div class="rx-sign"><div class="rx-qr" title="Reservado para o QR de validação da assinatura digital">' + ic("qr", 34) + "<small>QR de validação<br>assinatura digital</small></div>" +
      '<div class="rx-ass"><div class="rx-linha"></div><span>' + esc(c.nome) + (c.registro ? " · " + esc(c.registro) : "") + "</span></div></div></div>";
    var foot = '<footer class="rx-foot"><span>' + esc(c.rodape) + '</span><span class="rx-pg"></span></footer>';
    function pagina() { var p = document.createElement("div"); p.className = "rx-sheet"; p.innerHTML = head + '<div class="rx-body"><ol class="rx-list"></ol></div>' + foot; return p; }

    var m = document.createElement("div"); m.className = "rx-measure"; document.body.appendChild(m);
    var pages = [pagina()]; m.appendChild(pages[0]);
    function cheia(p) { var b = p.querySelector(".rx-body"); return b.scrollHeight > b.clientHeight + 1; }
    itens.forEach(function (f, i) {
      var p = pages[pages.length - 1], ol = p.querySelector(".rx-list");
      ol.insertAdjacentHTML("beforeend", itemHTML(f, i + 1));
      if (cheia(p) && ol.children.length > 1) {          // não cabe: leva a fórmula inteira para a próxima página
        var li = ol.lastElementChild; ol.removeChild(li);
        var np = pagina(); m.appendChild(np); pages.push(np); np.querySelector(".rx-list").appendChild(li);
      }
    });
    var last = pages[pages.length - 1]; last.querySelector(".rx-body").insertAdjacentHTML("beforeend", fim);
    if (cheia(last) && last.querySelector(".rx-list").children.length) {   // assinatura não coube: vai para página própria
      last.querySelector(".rx-end").remove();
      var np2 = pagina(); m.appendChild(np2); pages.push(np2); np2.querySelector(".rx-body").insertAdjacentHTML("beforeend", fim);
    }
    pages.forEach(function (p, i) { p.querySelector(".rx-pg").textContent = pages.length > 1 ? "Página " + (i + 1) + "/" + pages.length : ""; });
    var html = '<div class="rx-pages">' + pages.map(function (p) { return p.outerHTML; }).join("") + "</div>";
    m.remove();
    requestAnimationFrame(ajustarPrevias);
    return html;
  }
  // a folha é sempre 794 px; na tela ela é reduzida para caber na coluna
  function ajustarPrevias() {
    document.querySelectorAll(".afp-rxprev").forEach(function (el) {
      var p = el.querySelector(".rx-pages"); if (!p) return;
      var w = el.clientWidth - 56; p.style.zoom = Math.min(1, w / 794).toFixed(3);
    });
  }
  window.addEventListener("resize", function () { requestAnimationFrame(ajustarPrevias); });

  /* ---------- prescrever (carrinho) ---------- */
  // Impressão: a regra que esconde o resto da página e o @page A4 só valem durante a impressão da receita.
  function imprimir() {
    var st = document.createElement("style"); st.id = "afp-page"; st.textContent = "@page{size:A4;margin:0}";
    document.head.appendChild(st); document.body.classList.add("afp-printing");
    var fim = function () { document.body.classList.remove("afp-printing"); st.remove(); window.removeEventListener("afterprint", fim); };
    window.addEventListener("afterprint", fim); window.print(); setTimeout(fim, 1500);
  }
  function viewPrescrever(v) {
    if (!S.rx.length) {
      v.innerHTML = head("Monte a *receita*", "Monte a receita com as fórmulas que escolher.") +
        '<div class="afp-emptybox">' + ic("prescrever", 34) + "<b>Sua receita está vazia</b><p>Escolha fórmulas em Formulações ou dentro de uma lâmina. Você pode ajustar ativos e doses antes de adicionar.</p>" +
        '<button class="afp-btn" data-go>' + ic("formulas", 18) + " Ver formulações</button></div>";
      v.querySelector("[data-go]").addEventListener("click", function () { S.tab = "formulas"; render(); });
      return;
    }
    v.innerHTML = head("Monte a *receita*", "Revise as fórmulas, preencha o paciente e gere a receita.", '<button class="afp-ghost" data-clear>' + ic("lixo", 16) + " Limpar receita</button>") +
      '<div class="afp-rxgrid"><div class="afp-rxctl">' +
      painelPaciente() +
      '<section class="afp-panel"><h3>Fórmulas <small>' + S.rx.length + "</small></h3><ul class=\"afp-cart\">" + S.rx.map(function (f, i) {
        var ds = doses(f);
        return '<li><button class="afp-cart-main" data-edit="' + i + '"><b>' + esc(f.nome) + "</b><small>" + esc(ativos(f).slice(0, 3).join(" · ")) + (ds ? " — " + esc(ds) : "") + "</small></button>" +
          '<button class="afp-icbtn" data-edit="' + i + '" aria-label="Editar">' + ic("editar", 17) + '</button><button class="afp-icbtn" data-rm="' + i + '" aria-label="Remover">' + ic("lixo", 17) + "</button></li>";
      }).join("") + '</ul><button class="afp-ghost" data-more>' + ic("mais", 16) + " Adicionar fórmula</button></section>" +
      '<section class="afp-panel afp-sign"><div>' + ic("qr", 22) + '<span><b>Assinatura digital com QR</b><small>Em integração — a validação ICP-Brasil entra aqui.</small></span></div><button class="afp-ghost" disabled>Assinar</button></section>' +
      '<p class="afp-hint">Substâncias sujeitas a controle especial exigem receituário próprio (Portaria SVS/MS 344/98). Revise doses e posologia antes de emitir.</p>' +
      '<button class="afp-btn afp-btn-lg" id="afp-print">' + ic("print", 18) + " Imprimir / salvar PDF</button>" +
      '<button class="afp-ghost afp-copy" id="afp-copy">' + ic("laminas", 16) + " Copiar receita (texto)</button>" +
      painelEnvio() +
      '</div><div class="afp-rxprev" id="afp-prev">' + folha(S.paciente) + "</div></div>";
    var prev = v.querySelector("#afp-prev");
    wirePaciente(v, function () { prev.innerHTML = folha(S.paciente); });
    wireEnvio(v);
    v.querySelector("#afp-copy").addEventListener("click", function () {
      var t = receitaTexto(), ok = function () { toast("Receita copiada. Cole no seu sistema."); };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(ok, copiaVelha); else copiaVelha();
      function copiaVelha() { var a = document.createElement("textarea"); a.value = t; a.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(a); a.select(); try { document.execCommand("copy"); ok(); } catch (_) { toast("Não foi possível copiar"); } a.remove(); }
    });
    v.querySelectorAll("[data-edit]").forEach(function (b) { b.addEventListener("click", function () { var i = +b.getAttribute("data-edit"); editor(S.rx[i], i); }); });
    v.querySelectorAll("[data-rm]").forEach(function (b) { b.addEventListener("click", function () { S.rx.splice(+b.getAttribute("data-rm"), 1); saveRx(); render(); }); });
    v.querySelector("[data-more]").addEventListener("click", function () { S.tab = "formulas"; render(); });
    v.querySelector("[data-clear]").addEventListener("click", function () { if (confirm("Remover todas as fórmulas da receita?")) { S.rx = []; saveRx(); render(); } });
    v.querySelector("#afp-print").addEventListener("click", function () {
      var w = document.getElementById("afp-print-root") || document.body.appendChild(Object.assign(document.createElement("div"), { id: "afp-print-root" }));
      w.innerHTML = folha(S.paciente); registrarReceita("impressa / PDF"); imprimir();
    });
  }

  /* ---------- meu receituário ---------- */
  // Logo: aceita qualquer imagem; reduz no navegador (máx. 600 px, PNG) para caber no armazenamento local.
  function lerLogo(file) {
    return new Promise(function (ok, erro) {
      if (!file || !/^image\//.test(file.type)) return erro("Escolha um arquivo de imagem (PNG, JPG, SVG ou WebP).");
      if (file.size > 8 * 1024 * 1024) return erro("Imagem muito grande (máx. 8 MB).");
      var r = new FileReader();
      r.onerror = function () { erro("Não foi possível ler o arquivo."); };
      r.onload = function () {
        var img = new Image();
        img.onerror = function () { erro("Não foi possível abrir essa imagem."); };
        img.onload = function () {
          var w = img.naturalWidth || 600, h = img.naturalHeight || 300, k = Math.min(1, 600 / Math.max(w, h));
          var cv = document.createElement("canvas"); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
          cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
          ok(cv.toDataURL("image/png"));
        };
        img.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }
  function viewReceituario(v) {
    var c = S.cfg, p = S.perfil;
    var exemplo = S.rx.length ? null : [{ nome: "Fórmula de exemplo", forma: "cápsula", via: "oral", componentes: [{ ativo: "Ativo A", dose: "100 mg" }, { ativo: "Ativo B", dose: "50 mg" }], quantidade: "Fazer 30 doses", posologia: "Tomar 1 dose ao dia." }];
    function linha(r, val) { return '<div class="afp-kv"><span>' + r + "</span><b>" + (esc(val) || "<i>não informado</i>") + "</b></div>"; }
    v.innerHTML = head("Modelo da *receita*", "É assim que sua receita sai. Os dados vêm do seu cadastro; aqui você só personaliza o logo.") +
      '<div class="afp-rxgrid"><div class="afp-rxctl">' +
      '<section class="afp-panel"><h3>Logo</h3><div class="afp-logo">' + (c.logo ? '<img alt="Seu logo" src="' + c.logo + '">' : ic("upload", 26)) +
      '<div><button type="button" class="afp-ghost" id="afp-lbtn">' + ic("upload", 16) + (c.logo ? " Trocar logo" : " Enviar logo") + "</button>" +
      '<input type="file" id="afp-l" accept="image/*" style="display:none">' +
      (c.logo ? '<button type="button" class="afp-link" id="afp-lrm">Remover</button>' : "") +
      '<small>PNG, JPG, SVG ou WebP. Sai no canto superior direito da receita.</small><p class="afp-msg" id="afp-msg"></p></div></div></section>' +
      '<section class="afp-panel"><h3>Identificação ' + ic("escudo", 14) + "</h3>" +
      linha("Nome", c.nome) + linha("Registro", c.registro) + linha("Especialidade", c.especialidade) + "</section>" +
      '<section class="afp-panel"><h3>Consultório e rodapé</h3>' +
      linha("Endereço", [[p.endereco, p.numero, p.complemento].filter(Boolean).join(", "), p.bairro].filter(Boolean).join(" — ")) +
      linha("Região", [p.cidadeConsultorio || p.cidade, p.ufEndereco || p.uf].filter(Boolean).join("/") + (p.cep ? " · CEP " + p.cep : "")) +
      linha("Contato", [p.telConsultorio || p.telefone, p.emailReceita || p.email].filter(Boolean).join(" · ")) +
      '<button type="button" class="afp-ghost" id="afp-editcons">' + ic("editar", 16) + " Editar dados do consultório</button></section>" +
      '<p class="afp-hint">' + ic("escudo", 14) + "Para corrigir nome ou registro, fale com sac@aformulabr.com.br — esses dados são validados no cadastro.</p>" +
      '</div><div class="afp-rxprev" id="afp-prev2"></div></div>';
    var prev = v.querySelector("#afp-prev2"), msgEl = v.querySelector("#afp-msg");
    function aviso(t) { msgEl.className = "afp-msg on"; msgEl.textContent = t; }
    function upd() { prev.innerHTML = folha("Nome do paciente", exemplo || S.rx); }
    function save() {
      var keep = { logo: S.cfg.logo };
      if (!lsSet(LS_CFG, keep)) aviso("Não foi possível salvar neste navegador (armazenamento cheio ou bloqueado).");
      upd();
    }
    v.querySelector("#afp-editcons").addEventListener("click", function () { viewConsultorio(true); });
    var inp = v.querySelector("#afp-l");
    v.querySelector("#afp-lbtn").addEventListener("click", function () { inp.value = ""; inp.click(); });
    inp.addEventListener("change", function () {
      lerLogo(inp.files[0]).then(function (url) { S.cfg.logo = url; save(); render(); toast("Logo atualizado"); }).catch(aviso);
    });
    var rm = v.querySelector("#afp-lrm"); if (rm) rm.addEventListener("click", function () { S.cfg.logo = ""; save(); render(); });
    upd();
  }

  /* ======================================================================
     Ajustes da reunião 27/11: pacientes, farmácias parceiras, envio,
     carrinho, download/zoom das lâminas, posologias rápidas.
     Pacientes e farmácias ficam SÓ neste navegador (por conta), como a receita.
     ====================================================================== */
  function uid() { return norm((S.perfil && S.perfil.email) || (S.access && S.access.email) || "local").replace(/[^a-z0-9@._-]/g, ""); }
  function lsU(k, d) { return lsGet(k + ":" + uid(), d); }
  function lsUSet(k, v) { return lsSet(k + ":" + uid(), v); }
  var LS_PAC = "afp-pacientes-v1", LS_FARM = "afp-farmacias-v1", LS_POS = "afp-posologias-v1";
  function pacientes() { return S.pac || (S.pac = lsU(LS_PAC, [])); }
  function salvarPac() { if (!lsUSet(LS_PAC, S.pac)) toast("Não foi possível salvar neste navegador"); }
  function farmacias() { return S.farm || (S.farm = lsU(LS_FARM, [])); }
  function salvarFarm() { if (!lsUSet(LS_FARM, S.farm)) toast("Não foi possível salvar neste navegador"); }
  function pacAtual() { return pacientes().filter(function (p) { return p.id === S.pacId; })[0] || null; }
  function soDig(s) { return (s || "").replace(/\D/g, ""); }
  function cpfFmt(s) { var d = soDig(s).slice(0, 11); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : d; }
  function cpfOk(s) {
    var d = soDig(s); if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    for (var t = 9; t < 11; t++) { var sm = 0; for (var i = 0; i < t; i++) sm += +d[i] * (t + 1 - i); if (((sm * 10) % 11) % 10 !== +d[t]) return false; }
    return true;
  }
  function telFmt(s) { var d = soDig(s); if (d.length === 13 && d.indexOf("55") === 0) d = d.slice(2); return d.length === 11 ? d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3") : d.length === 10 ? d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3") : s || ""; }
  function emailOk(s) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s || ""); }
  function dataBR(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? m[3] + "/" + m[2] + "/" + m[1] : iso || ""; }

  /* ---------- via × forma farmacêutica (uso oral não mostra forma tópica e vice-versa) ---------- */
  // Regra da reunião 27/11: nutricionista (CRN) não prescreve nada de uso tópico.
  function ehNutri() { return /^crn/i.test(((S.perfil && S.perfil.conselho) || "").trim()); }
  function grupoVia(v) {
    v = norm(v); if (!v) return "";
    if (/^(oral|sublingual|bucal)/.test(v)) return "oral";
    if (/^(top|transderm|cutane|capilar|dermat)/.test(v)) return "topica";
    if (/^vagin/.test(v)) return "vaginal";
    if (/^oft/.test(v)) return "oftalmica";
    return v;
  }
  var VIAS = [["oral", "Oral"], ["sublingual", "Sublingual"], ["tópica", "Tópica"], ["transdérmica", "Transdérmica"], ["vaginal", "Vaginal"], ["oftálmica", "Oftálmica"]];
  var GRUPO_NOME = { oral: "uso oral", topica: "uso tópico", vaginal: "uso vaginal", oftalmica: "uso oftálmico" };
  function formaInfo(txt) { var id = formaDe(txt); return id ? FORMA_LIST.filter(function (x) { return x.id === id; })[0] : null; }
  function conflitoVia(f) {
    var fi = formaInfo(f.forma), gv = grupoVia(f.via);
    if (!fi || !gv) return "";
    var gf = grupoVia(fi.via);
    return gf && gf !== gv ? "“" + f.forma + "” é de " + GRUPO_NOME[gf] + " e esta fórmula está como " + (GRUPO_NOME[gv] || "uso " + f.via) + ". Troque a forma farmacêutica ou a via." : "";
  }

  /* ---------- posologias rápidas ---------- */
  var POS_PADRAO = {
    oral: ["Tomar 1 dose ao dia.", "Tomar 1 dose 2 vezes ao dia.", "Tomar 1 dose pela manhã, em jejum.", "Tomar 1 dose à noite, antes de dormir.", "Tomar 1 dose após as refeições."],
    topica: ["Aplicar na área afetada 1 vez ao dia, à noite.", "Aplicar na área afetada 2 vezes ao dia.", "Aplicar no couro cabeludo 1 vez ao dia.", "Aplicar pela manhã, antes do protetor solar."],
    "": ["Usar 1 vez ao dia.", "Usar 2 vezes ao dia."]
  };
  function posSugestoes(f) {
    var g = grupoVia(f.via), base = POS_PADRAO[g] || POS_PADRAO[""], minhas = lsU(LS_POS, []);
    return { minhas: minhas, base: base.filter(function (p) { return minhas.indexOf(p) < 0; }) };
  }

  /* ---------- modal genérico ---------- */
  function modal(titulo, corpo, rodape, largura) {
    var d = document.createElement("div"); d.className = "afp-modal";
    d.innerHTML = '<div class="afp-dlg" role="dialog" aria-modal="true" aria-label="' + esc(titulo) + '"' + (largura ? ' style="width:min(' + largura + 'px,100%)"' : "") + ">" +
      '<header class="afp-dlg-h"><div><h3 class="afp-dlg-t">' + esc(titulo) + '</h3></div><button class="afp-icbtn" data-close aria-label="Fechar">' + ic("x") + "</button></header>" +
      '<div class="afp-dlg-b">' + corpo + "</div>" + (rodape ? '<footer class="afp-dlg-f">' + rodape + "</footer>" : "") + "</div>";
    document.body.appendChild(d); document.body.classList.add("afp-lock");
    function k(e) { if (e.key === "Escape") d.fechar(); }
    d.fechar = function () { d.remove(); document.body.classList.remove("afp-lock"); document.removeEventListener("keydown", k); };
    document.addEventListener("keydown", k);
    d.addEventListener("click", function (e) { if (e.target === d || e.target.closest("[data-close]")) d.fechar(); });
    return d;
  }
  function campo(id, rotulo, val, extra) { return '<label class="afp-full"><span>' + rotulo + '</span><input class="afp-in" id="' + id + '" value="' + esc(val || "") + '" ' + (extra || "") + "></label>"; }

  /* ---------- pacientes ---------- */
  function formPaciente(p, depois) {
    var novo = !p; p = p || { id: novoId(), nome: "", cpf: "", nascimento: "", telefone: "", email: "", obs: "", historico: [] };
    var d = modal(novo ? "Novo paciente" : "Editar paciente",
      campo("pc-nome", "Nome completo *", p.nome, 'autocomplete="off"') +
      '<div class="afp-two">' + campo("pc-cpf", "CPF", cpfFmt(p.cpf), 'inputmode="numeric" placeholder="000.000.000-00"') + campo("pc-nasc", "Data de nascimento", p.nascimento, 'type="date"') + "</div>" +
      '<div class="afp-two">' + campo("pc-tel", "Telefone / WhatsApp", telFmt(p.telefone), 'type="tel" placeholder="(11) 90000-0000"') + campo("pc-mail", "E-mail", p.email, 'type="email" placeholder="paciente@email.com"') + "</div>" +
      '<label class="afp-full"><span>Observações</span><textarea class="afp-in" id="pc-obs" rows="2" placeholder="Alergias, restrições…">' + esc(p.obs) + "</textarea></label>" +
      '<p class="afp-hint">' + ic("escudo", 14) + "Os dados do paciente ficam só neste navegador. Nada é enviado ao portal.</p>" +
      '<p class="afp-msg" id="pc-msg"></p>',
      (novo ? "<span></span>" : '<button class="afp-link afp-del" data-del>' + ic("lixo", 16) + " Excluir</button>") +
      '<div class="afp-dlg-fa"><button class="afp-ghost" data-close>Cancelar</button><button class="afp-btn" data-ok>' + ic("ok", 18) + " Salvar paciente</button></div>");
    var g = function (id) { return d.querySelector("#" + id); };
    g("pc-cpf").addEventListener("input", function () { this.value = cpfFmt(this.value); });
    d.addEventListener("input", function (e) { e.target.classList && e.target.classList.remove("afp-bad"); });
    d.querySelector("[data-ok]").addEventListener("click", function () {
      var v = { nome: g("pc-nome").value.trim(), cpf: soDig(g("pc-cpf").value), nascimento: g("pc-nasc").value, telefone: soDig(g("pc-tel").value), email: g("pc-mail").value.trim(), obs: g("pc-obs").value.trim() };
      var dup = v.cpf && pacientes().some(function (x) { return x.id !== p.id && x.cpf === v.cpf; });
      var regras = [["pc-nome", v.nome.length >= 3, "Informe o nome do paciente."], ["pc-cpf", !v.cpf || cpfOk(v.cpf), "CPF inválido."], ["pc-cpf", !dup, "Já existe um paciente com este CPF."],
        ["pc-tel", !v.telefone || v.telefone.length >= 10, "Telefone incompleto (com DDD)."], ["pc-mail", !v.email || emailOk(v.email), "E-mail inválido."]];
      var ruim = regras.filter(function (r) { return !r[1]; });
      ruim.forEach(function (r) { g(r[0]).classList.add("afp-bad"); });
      if (ruim.length) { var m = g("pc-msg"); m.className = "afp-msg on"; m.textContent = ruim.map(function (r) { return r[2]; }).join(" "); return; }
      Object.assign(p, v);
      var l = pacientes(), i = l.map(function (x) { return x.id; }).indexOf(p.id);
      if (i > -1) l[i] = p; else l.unshift(p);
      salvarPac(); d.fechar(); toast(novo ? "Paciente cadastrado" : "Paciente atualizado");
      if (depois) depois(p); else render();
    });
    var del = d.querySelector("[data-del]"); if (del) del.addEventListener("click", function () {
      if (!confirm("Excluir " + p.nome + " e o histórico de receitas dele?")) return;
      S.pac = pacientes().filter(function (x) { return x.id !== p.id; }); if (S.pacId === p.id) S.pacId = null;
      salvarPac(); d.fechar(); render(); toast("Paciente excluído");
    });
    g("pc-nome").focus();
  }
  function viewPacientes(v) {
    var q = norm(S.qPac || ""), l = pacientes().filter(function (p) { return !q || norm(p.nome).indexOf(q) > -1 || soDig(p.cpf).indexOf(soDig(q) || "§") > -1 || norm(p.email).indexOf(q) > -1; })
      .sort(function (a, b) { return a.nome.localeCompare(b.nome); });
    v.innerHTML = head("Meus *pacientes*", "Cadastro básico e o histórico das receitas de cada paciente.",
        '<div class="afp-hbts"><button class="afp-ghost" data-imp>' + ic("upload", 16) + ' Importar planilha</button><button class="afp-btn" data-novo>' + ic("mais", 18) + " Novo paciente</button></div>") +
      (pacientes().length ? '<div class="afp-tools"><label class="afp-search">' + ic("busca", 18) + '<input type="search" id="afp-qpac" autocomplete="off" placeholder="Buscar por nome, CPF ou e-mail" value="' + esc(S.qPac || "") + '"></label></div>' +
        '<p class="afp-count"><b>' + l.length + "</b> paciente" + (l.length === 1 ? "" : "s") + "</p>" : "") +
      (l.length ? '<div class="afp-plist">' + l.map(function (p) {
        var h = p.historico || [], aberto = S.pacOpen === p.id;
        return '<article class="afp-pcard' + (aberto ? " on" : "") + '"><div class="afp-pcard-h"><span class="afp-av">' + esc(p.nome.split(" ").filter(Boolean).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join("")) + "</span>" +
          '<div class="afp-pcard-id"><b>' + esc(p.nome) + "</b><small>" + esc([p.cpf ? "CPF " + cpfFmt(p.cpf) : "", p.nascimento ? "Nasc. " + dataBR(p.nascimento) : ""].filter(Boolean).join(" · ") || "Sem CPF") + "</small>" +
          "<small>" + esc([telFmt(p.telefone), p.email].filter(Boolean).join(" · ")) + "</small></div>" +
          '<div class="afp-pcard-a"><button class="afp-ghost" data-hist="' + p.id + '">' + ic("laminas", 16) + " Histórico (" + h.length + ")</button>" +
          '<button class="afp-icbtn" data-edp="' + p.id + '" aria-label="Editar paciente">' + ic("editar", 17) + "</button>" +
          '<button class="afp-btn" data-rxp="' + p.id + '">' + ic("prescrever", 16) + " Prescrever</button></div></div>" +
          (aberto ? '<div class="afp-hist">' + (h.length ? h.map(function (r, i) {
            return '<div class="afp-hist-it"><div><b>' + esc(dataBR(r.data)) + "</b><small>" + esc((r.itens || []).map(function (f) { return f.nome; }).join(" · ")) + "</small>" +
              (r.envios && r.envios.length ? '<small class="afp-env">' + esc(r.envios.join(" · ")) + "</small>" : "") + "</div>" +
              '<button class="afp-ghost" data-rep="' + p.id + ":" + i + '">' + ic("mais", 16) + " Repetir receita</button></div>";
          }).join("") : '<p class="afp-hint">Nenhuma receita emitida para este paciente ainda. Ao imprimir ou enviar uma receita, ela entra aqui.</p>') + "</div>" : "") + "</article>";
      }).join("") + "</div>"
        : '<div class="afp-emptybox">' + ic("receituario", 34) + "<b>" + (pacientes().length ? "Nenhum paciente com essa busca" : "Nenhum paciente cadastrado") + "</b>" +
          "<p>Cadastre com nome, CPF, telefone e e-mail, ou importe a planilha do sistema da sua clínica (CSV ou Excel).</p></div>") +
      '<p class="afp-hint">' + ic("escudo", 14) + "Os dados dos pacientes ficam só neste navegador, ligados à sua conta. Em outro computador, importe a planilha de novo.</p>";
    var qi = v.querySelector("#afp-qpac"), tm;
    if (qi) qi.addEventListener("input", function () { clearTimeout(tm); tm = setTimeout(function () { S.qPac = qi.value; var p = qi.selectionStart; render(); var n = S.el.querySelector("#afp-qpac"); n.focus(); n.setSelectionRange(p, p); }, 160); });
    v.querySelectorAll("[data-novo]").forEach(function (b) { b.addEventListener("click", function () { formPaciente(null); }); });
    v.querySelector("[data-imp]").addEventListener("click", importarPlanilha);
    v.querySelectorAll("[data-edp]").forEach(function (b) { b.addEventListener("click", function () { formPaciente(pacientes().filter(function (x) { return x.id === b.getAttribute("data-edp"); })[0]); }); });
    v.querySelectorAll("[data-hist]").forEach(function (b) { b.addEventListener("click", function () { var id = b.getAttribute("data-hist"); S.pacOpen = S.pacOpen === id ? null : id; render(); }); });
    v.querySelectorAll("[data-rxp]").forEach(function (b) { b.addEventListener("click", function () { S.pacId = b.getAttribute("data-rxp"); S.paciente = (pacAtual() || {}).nome || ""; irPara(S.rx.length ? "prescrever" : "formulas"); if (!S.rx.length) toast("Escolha as fórmulas para " + S.paciente.split(" ")[0]); }); });
    v.querySelectorAll("[data-rep]").forEach(function (b) { b.addEventListener("click", function () {
      var x = b.getAttribute("data-rep").split(":"), p = pacientes().filter(function (y) { return y.id === x[0]; })[0], r = p && p.historico[+x[1]];
      if (!r) return;
      if (S.rx.length && !confirm("A receita atual tem " + S.rx.length + " fórmula(s). Substituir pela receita de " + dataBR(r.data) + "?")) return;
      S.rx = JSON.parse(JSON.stringify(r.itens)); saveRx(); S.pacId = p.id; S.paciente = p.nome; irPara("prescrever"); toast("Receita carregada");
    }); });
  }
  // histórico: 1 registro por receita emitida (impressa ou enviada). Mesma receita no mesmo dia só acrescenta o envio.
  function registrarReceita(envio) {
    var p = pacAtual(); if (!p || !S.rx.length) return;
    var hoje = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10), assin = JSON.stringify(S.rx);
    p.historico = p.historico || [];
    var r = p.historico.filter(function (x) { return x.data === hoje && JSON.stringify(x.itens) === assin; })[0];
    if (!r) { r = { data: hoje, itens: JSON.parse(assin), envios: [] }; p.historico.unshift(r); if (p.historico.length > 100) p.historico.length = 100; }
    if (envio && r.envios.indexOf(envio) < 0) r.envios.push(envio);
    salvarPac();
  }

  /* ---------- importação de planilha (CSV ou Excel), com de-para de colunas ---------- */
  var CAMPOS_PAC = [["", "Ignorar"], ["nome", "Nome"], ["cpf", "CPF"], ["nascimento", "Nascimento"], ["telefone", "Telefone"], ["email", "E-mail"], ["obs", "Observações"]];
  function adivinhar(h) {
    h = norm(h);
    if (/cpf|documento/.test(h)) return "cpf";
    if (/mail/.test(h)) return "email";
    if (/nasc|aniver|data de nasc|dt_?nasc/.test(h)) return "nascimento";
    if (/fone|celular|whats|tel\b|telefone|contato/.test(h)) return "telefone";
    if (/^nome|paciente|cliente|nome completo/.test(h)) return "nome";
    if (/obs|nota|alerg/.test(h)) return "obs";
    return "";
  }
  function lerCSV(txt) {
    txt = txt.replace(/^﻿/, "");
    var l1 = txt.split(/\r?\n/)[0] || "", sep = [";", ",", "\t"].sort(function (a, b) { return l1.split(b).length - l1.split(a).length; })[0];
    var rows = [], row = [], cel = "", q = false;
    for (var i = 0; i < txt.length; i++) {
      var c = txt[i];
      if (q) { if (c === '"') { if (txt[i + 1] === '"') { cel += '"'; i++; } else q = false; } else cel += c; }
      else if (c === '"') q = true;
      else if (c === sep) { row.push(cel); cel = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && txt[i + 1] === "\n") i++; row.push(cel); rows.push(row); row = []; cel = ""; }
      else cel += c;
    }
    if (cel || row.length) { row.push(cel); rows.push(row); }
    return rows;
  }
  // .xlsx = zip de XML. Leitor mínimo (sem biblioteca): diretório central + inflate nativo do navegador.
  function lerXLSX(buf) {
    var dv = new DataView(buf), u8 = new Uint8Array(buf), td = new TextDecoder(), e = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) return Promise.reject("Arquivo Excel inválido.");
    var n = dv.getUint16(e + 10, true), off = dv.getUint32(e + 16, true), arq = {};
    for (var k = 0; k < n; k++) {
      var nl = dv.getUint16(off + 28, true), el = dv.getUint16(off + 30, true), cl = dv.getUint16(off + 32, true);
      arq[td.decode(u8.subarray(off + 46, off + 46 + nl))] = { m: dv.getUint16(off + 10, true), csz: dv.getUint32(off + 20, true), lo: dv.getUint32(off + 42, true) };
      off += 46 + nl + el + cl;
    }
    function ler(nome) {
      var f = arq[nome]; if (!f) return Promise.resolve("");
      var s = f.lo + 30 + dv.getUint16(f.lo + 26, true) + dv.getUint16(f.lo + 28, true), dado = u8.slice(s, s + f.csz);
      if (f.m === 0) return Promise.resolve(td.decode(dado));
      if (typeof DecompressionStream === "undefined") return Promise.reject("Este navegador não abre Excel. Salve a planilha como CSV e importe de novo.");
      return new Response(new Blob([dado]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
    }
    var aba = Object.keys(arq).filter(function (x) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(x); }).sort(function (a, b) { return parseInt(a.replace(/\D/g, "")) - parseInt(b.replace(/\D/g, "")); })[0];
    if (!aba) return Promise.reject("Não achei nenhuma aba na planilha.");
    return Promise.all([ler("xl/sharedStrings.xml"), ler(aba)]).then(function (x) {
      var dp = new DOMParser(), ss = [], xs = x[0] ? dp.parseFromString(x[0], "application/xml") : null;
      if (xs) Array.prototype.forEach.call(xs.getElementsByTagName("si"), function (si) { ss.push(Array.prototype.map.call(si.getElementsByTagName("t"), function (t) { return t.textContent; }).join("")); });
      var doc = dp.parseFromString(x[1], "application/xml"), rows = [];
      Array.prototype.forEach.call(doc.getElementsByTagName("row"), function (r) {
        var linha = [];
        Array.prototype.forEach.call(r.getElementsByTagName("c"), function (c) {
          var ref = (c.getAttribute("r") || "").replace(/\d+/g, ""), col = 0;
          for (var j = 0; j < ref.length; j++) col = col * 26 + ref.charCodeAt(j) - 64;
          var t = c.getAttribute("t"), vv = c.getElementsByTagName("v")[0], val = vv ? vv.textContent : "";
          if (t === "s") val = ss[+val] || "";
          else if (t === "inlineStr") val = Array.prototype.map.call(c.getElementsByTagName("t"), function (z) { return z.textContent; }).join("");
          linha[(col || linha.length + 1) - 1] = val;
        });
        for (var q2 = 0; q2 < linha.length; q2++) if (linha[q2] == null) linha[q2] = "";
        rows.push(linha);
      });
      return rows;
    });
  }
  function dataISO(v) {
    v = String(v || "").trim(); if (!v) return "";
    if (/^\d{5}(\.\d+)?$/.test(v)) return new Date(Date.UTC(1899, 11, 30) + Math.floor(+v) * 864e5).toISOString().slice(0, 10);   // número de série do Excel
    var m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(v);
    if (m) { var a = +m[3]; if (a < 100) a += a > 30 ? 1900 : 2000; return a + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2); }
    return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : "";
  }
  function importarPlanilha() {
    var d = modal("Importar pacientes",
      '<p class="afp-ind">Exporte a lista de pacientes do sistema da sua clínica em <b>CSV</b> ou <b>Excel (.xlsx)</b>. Qualquer modelo serve: no próximo passo você diz o que é cada coluna.</p>' +
      '<label class="afp-drop"><input type="file" id="imp-f" accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">' + ic("upload", 26) + "<b>Escolher planilha</b><small>CSV ou XLSX · a primeira linha deve ser o cabeçalho</small></label>" +
      '<div id="imp-map"></div><p class="afp-msg" id="imp-msg"></p>',
      '<span></span><div class="afp-dlg-fa"><button class="afp-ghost" data-close>Cancelar</button><button class="afp-btn" data-ok disabled>' + ic("ok", 18) + " Importar</button></div>", 760);
    var rows = null, mapa = [], msg = d.querySelector("#imp-msg"), ok = d.querySelector("[data-ok]");
    function erro(t) { msg.className = "afp-msg on"; msg.textContent = t; }
    d.querySelector("#imp-f").addEventListener("change", function () {
      var f = this.files[0]; msg.className = "afp-msg"; if (!f) return;
      if (f.size > 15 * 1024 * 1024) return erro("Arquivo muito grande (máx. 15 MB).");
      var p = /\.xlsx$/i.test(f.name) ? f.arrayBuffer().then(lerXLSX) : f.arrayBuffer().then(function (b) {
        var t = new TextDecoder("utf-8").decode(b); if (t.indexOf("�") > -1) t = new TextDecoder("windows-1252").decode(b); return lerCSV(t);
      });
      p.then(function (r) {
        r = r.filter(function (l) { return l.some(function (c) { return String(c).trim(); }); });
        if (r.length < 2) return erro("A planilha precisa de um cabeçalho e pelo menos um paciente.");
        rows = r; mapa = r[0].map(function (h) { return adivinhar(h); });
        var usados = {}; mapa = mapa.map(function (m) { if (m && usados[m]) return ""; usados[m] = 1; return m; });
        desenhar();
      }).catch(function (e) { erro(typeof e === "string" ? e : "Não foi possível ler esse arquivo."); });
    });
    function desenhar() {
      var cab = rows[0], ex = rows.slice(1, 4);
      d.querySelector("#imp-map").innerHTML = '<p class="afp-fg">' + (rows.length - 1) + " linhas encontradas · diga o que é cada coluna</p>" +
        '<div class="afp-map">' + cab.map(function (h, i) {
          return '<div class="afp-map-r"><div><b>' + esc(h || "Coluna " + (i + 1)) + "</b><small>" + esc(ex.map(function (l) { return l[i] || ""; }).filter(Boolean).slice(0, 2).join(" · ") || "vazio") + "</small></div>" +
            '<select class="afp-in" data-col="' + i + '">' + CAMPOS_PAC.map(function (c) { return '<option value="' + c[0] + '"' + (mapa[i] === c[0] ? " selected" : "") + ">" + c[1] + "</option>"; }).join("") + "</select></div>";
        }).join("") + "</div>";
      d.querySelectorAll("[data-col]").forEach(function (s) { s.addEventListener("change", function () { mapa[+s.getAttribute("data-col")] = s.value; checar(); }); });
      checar();
    }
    function checar() { var temNome = mapa.indexOf("nome") > -1; ok.disabled = !temNome; if (!temNome) erro("Indique qual coluna é o Nome."); else msg.className = "afp-msg"; }
    ok.addEventListener("click", function () {
      var l = pacientes(), cpfs = {}, chaves = {}, novos = 0, iguais = 0, semNome = 0;
      l.forEach(function (p) { if (p.cpf) cpfs[p.cpf] = 1; chaves[norm(p.nome) + "|" + p.telefone] = 1; });
      rows.slice(1).forEach(function (r) {
        var p = { id: novoId(), nome: "", cpf: "", nascimento: "", telefone: "", email: "", obs: "", historico: [] };
        mapa.forEach(function (m, i) {
          if (!m) return; var v = String(r[i] == null ? "" : r[i]).trim(); if (!v) return;
          if (m === "cpf") { var dg = soDig(v); p.cpf = dg.length && dg.length < 11 ? ("00000000000" + dg).slice(-11) : dg; }
          else if (m === "telefone") p.telefone = soDig(v).replace(/^55(?=\d{10,11}$)/, "");
          else if (m === "nascimento") p.nascimento = dataISO(v);
          else if (m === "obs") p.obs = p.obs ? p.obs + " · " + v : v;
          else p[m] = p[m] || v;
        });
        if (p.nome.length < 2) { semNome++; return; }
        if (p.cpf && !cpfOk(p.cpf)) p.cpf = "";
        if (p.email && !emailOk(p.email)) p.email = "";
        var ch = norm(p.nome) + "|" + p.telefone;
        if ((p.cpf && cpfs[p.cpf]) || chaves[ch]) { iguais++; return; }
        if (p.cpf) cpfs[p.cpf] = 1; chaves[ch] = 1; l.push(p); novos++;
      });
      salvarPac(); d.fechar(); render();
      toast(novos + " paciente" + (novos === 1 ? "" : "s") + " importado" + (novos === 1 ? "" : "s"));
      if (iguais || semNome) setTimeout(function () { alert(novos + " importados." + (iguais ? "\n" + iguais + " já estavam cadastrados (mesmo CPF ou nome+telefone)." : "") + (semNome ? "\n" + semNome + " linhas sem nome foram ignoradas." : "")); }, 300);
    });
  }

  /* ---------- farmácias parceiras ---------- */
  function formFarmacia(f, depois) {
    var novo = !f; f = f || { id: novoId(), nome: "", email: "", whatsapp: "", cidade: "", obs: "" };
    var d = modal(novo ? "Nova farmácia parceira" : "Editar farmácia",
      campo("fa-nome", "Nome da farmácia *", f.nome, 'placeholder="Ex.: A Fórmula — Moema"') +
      '<div class="afp-two">' + campo("fa-mail", "E-mail para receber receitas *", f.email, 'type="email" placeholder="receitas@farmacia.com.br"') + campo("fa-zap", "WhatsApp", telFmt(f.whatsapp), 'type="tel" placeholder="(11) 90000-0000"') + "</div>" +
      campo("fa-cid", "Cidade / bairro", f.cidade) +
      '<p class="afp-hint">' + ic("escudo", 14) + "A farmácia nunca sai impressa na receita (regra sanitária). Ela só aparece na hora de enviar, e você escolhe se envia.</p>" +
      '<p class="afp-msg" id="fa-msg"></p>',
      (novo ? "<span></span>" : '<button class="afp-link afp-del" data-del>' + ic("lixo", 16) + " Excluir</button>") +
      '<div class="afp-dlg-fa"><button class="afp-ghost" data-close>Cancelar</button><button class="afp-btn" data-ok>' + ic("ok", 18) + " Salvar farmácia</button></div>");
    var g = function (id) { return d.querySelector("#" + id); };
    d.addEventListener("input", function (e) { e.target.classList && e.target.classList.remove("afp-bad"); });
    d.querySelector("[data-ok]").addEventListener("click", function () {
      var v = { nome: g("fa-nome").value.trim(), email: g("fa-mail").value.trim(), whatsapp: soDig(g("fa-zap").value), cidade: g("fa-cid").value.trim() };
      var regras = [["fa-nome", v.nome.length >= 2, "Informe o nome."], ["fa-mail", emailOk(v.email), "Informe um e-mail válido."], ["fa-zap", !v.whatsapp || v.whatsapp.length >= 10, "WhatsApp incompleto (com DDD)."]];
      var ruim = regras.filter(function (r) { return !r[1]; }); ruim.forEach(function (r) { g(r[0]).classList.add("afp-bad"); });
      if (ruim.length) { var m = g("fa-msg"); m.className = "afp-msg on"; m.textContent = ruim.map(function (r) { return r[2]; }).join(" "); return; }
      Object.assign(f, v);
      var l = farmacias(), i = l.map(function (x) { return x.id; }).indexOf(f.id); if (i > -1) l[i] = f; else l.push(f);
      salvarFarm(); d.fechar(); toast(novo ? "Farmácia cadastrada" : "Farmácia atualizada"); if (depois) depois(f); else render();
    });
    var del = d.querySelector("[data-del]"); if (del) del.addEventListener("click", function () {
      if (!confirm("Excluir " + f.nome + "?")) return;
      S.farm = farmacias().filter(function (x) { return x.id !== f.id; }); if (S.farmId === f.id) S.farmId = ""; salvarFarm(); d.fechar(); render();
    });
    g("fa-nome").focus();
  }
  function viewFarmacias(v) {
    var l = farmacias();
    v.innerHTML = head("Farmácias *parceiras*", "As farmácias para onde você envia receitas. Ao concluir a prescrição, você escolhe se envia e para qual.",
        '<button class="afp-btn" data-nova>' + ic("mais", 18) + " Nova farmácia</button>") +
      (l.length ? '<div class="afp-plist">' + l.map(function (f) {
        return '<article class="afp-pcard"><div class="afp-pcard-h"><span class="afp-navic">' + ic("loja", 20) + "</span>" +
          '<div class="afp-pcard-id"><b>' + esc(f.nome) + "</b><small>" + esc([f.email, telFmt(f.whatsapp)].filter(Boolean).join(" · ")) + "</small>" + (f.cidade ? "<small>" + esc(f.cidade) + "</small>" : "") + "</div>" +
          '<div class="afp-pcard-a"><button class="afp-ghost" data-edf="' + f.id + '">' + ic("editar", 16) + " Editar</button></div></div></article>";
      }).join("") + "</div>"
        : '<div class="afp-emptybox">' + ic("loja", 34) + "<b>Nenhuma farmácia cadastrada</b><p>Cadastre o e-mail (e, se quiser, o WhatsApp) das farmácias com quem você trabalha para enviar a receita direto ao concluir.</p></div>") +
      '<p class="afp-hint">' + ic("escudo", 14) + "Por regra sanitária, a receita não pode indicar farmácia. Por isso ela não aparece no papel: só no envio, por sua escolha.</p>";
    v.querySelector("[data-nova]").addEventListener("click", function () { formFarmacia(null); });
    v.querySelectorAll("[data-edf]").forEach(function (b) { b.addEventListener("click", function () { formFarmacia(farmacias().filter(function (x) { return x.id === b.getAttribute("data-edf"); })[0]); }); });
  }

  /* ---------- envio (e-mail / WhatsApp) ---------- */
  function receitaTexto() {
    var c = S.cfg, p = pacAtual(), L = [];
    L.push("RECEITA — " + c.nome + (c.registro ? " · " + c.registro : "") + (c.especialidade ? " · " + c.especialidade : ""));
    L.push("Paciente: " + (S.paciente || (p && p.nome) || "") + "   Data: " + hoje()); L.push("");
    S.rx.forEach(function (f, i) {
      L.push((i + 1) + ". " + f.nome + (f.forma ? " — " + f.forma : "") + (viaLabel(f) ? " (" + viaLabel(f) + ")" : ""));
      (f.componentes || []).forEach(function (x) { L.push("   " + x.ativo + "  " + x.dose); });
      if (f.quantidade) L.push("   " + f.quantidade);
      if (f.posologia) L.push("   Posologia: " + f.posologia);
      L.push("");
    });
    if (c.rodape) L.push(c.rodape.replace(/\n/g, " · "));
    return L.join("\n");
  }
  function abrirEmail(para, assunto, corpo) { location.href = "mailto:" + encodeURIComponent(para) + "?subject=" + encodeURIComponent(assunto) + "&body=" + encodeURIComponent(corpo); }
  function abrirZap(tel, texto) { var d = soDig(tel); if (d.length <= 11) d = "55" + d; window.open("https://wa.me/" + d + "?text=" + encodeURIComponent(texto), "_blank", "noopener"); }
  function painelEnvio() {
    var fs = farmacias(), p = pacAtual(), f = fs.filter(function (x) { return x.id === S.farmId; })[0];
    return '<section class="afp-panel" id="afp-envio"><h3>' + ic("loja", 16) + " Concluir e enviar</h3>" +
      '<p class="afp-fg">Para a farmácia</p>' +
      (fs.length ? '<select class="afp-in" id="afp-farmsel"><option value="">Não enviar para farmácia</option>' + fs.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === S.farmId ? " selected" : "") + ">" + esc(x.nome) + "</option>"; }).join("") + "</select>" +
        (f ? '<div class="afp-envbt"><button class="afp-ghost" data-env="farm-mail">' + ic("upload", 16) + " Enviar por e-mail</button>" + (f.whatsapp ? '<button class="afp-ghost" data-env="farm-zap">' + ic("upload", 16) + " WhatsApp</button>" : "") + "</div>" : "")
        : '<p class="afp-hint">Nenhuma farmácia parceira cadastrada.</p>') +
      '<button class="afp-link" data-novafarm>' + ic("mais", 16) + " Cadastrar farmácia parceira</button>" +
      '<p class="afp-fg">Para o paciente</p>' +
      (p && (p.email || p.telefone) ? '<div class="afp-envbt">' + (p.email ? '<button class="afp-ghost" data-env="pac-mail">' + ic("upload", 16) + " E-mail do paciente</button>" : "") +
          (p.telefone ? '<button class="afp-ghost" data-env="pac-zap">' + ic("upload", 16) + " WhatsApp do paciente</button>" : "") + "</div>"
        : '<p class="afp-hint">' + (p ? "Cadastre e-mail ou telefone do paciente para enviar a receita a ele." : "Escolha um paciente cadastrado para enviar a receita a ele.") + "</p>") +
      '<p class="afp-hint">' + ic("escudo", 14) + "O envio abre o seu e-mail ou WhatsApp com a receita escrita na mensagem. Para mandar o PDF, use “Imprimir / salvar PDF” e anexe o arquivo.</p></section>";
  }
  function wireEnvio(v) {
    var s = v.querySelector("#afp-farmsel"); if (s) s.addEventListener("change", function () { S.farmId = s.value; render(); });
    var nf = v.querySelector("[data-novafarm]"); if (nf) nf.addEventListener("click", function () { formFarmacia(null, function (f) { S.farmId = f.id; render(); }); });
    v.querySelectorAll("[data-env]").forEach(function (b) { b.addEventListener("click", function () {
      if (!(S.paciente || "").trim()) { var pi = v.querySelector("#afp-pac"); if (pi) { pi.classList.add("afp-bad"); pi.focus(); } toast("Informe o paciente antes de enviar"); return; }
      var k = b.getAttribute("data-env"), f = farmacias().filter(function (x) { return x.id === S.farmId; })[0], p = pacAtual(), txt = receitaTexto();
      var assunto = "Receita — " + S.paciente + " — " + hoje();
      if (k === "farm-mail") { abrirEmail(f.email, assunto, "Olá, segue a receita de " + S.paciente + " para orçamento e manipulação.\n\n" + txt); registrarReceita("e-mail p/ " + f.nome); }
      if (k === "farm-zap") { abrirZap(f.whatsapp, "Olá, segue a receita de " + S.paciente + " para orçamento e manipulação.\n\n" + txt); registrarReceita("WhatsApp p/ " + f.nome); }
      if (k === "pac-mail") { abrirEmail(p.email, "Sua receita — " + hoje(), "Olá, " + p.nome.split(" ")[0] + ". Segue a sua receita.\n\n" + txt); registrarReceita("e-mail p/ paciente"); }
      if (k === "pac-zap") { abrirZap(p.telefone, "Olá, " + p.nome.split(" ")[0] + ". Segue a sua receita.\n\n" + txt); registrarReceita("WhatsApp p/ paciente"); }
    }); });
  }
  function painelPaciente() {
    var p = pacAtual(), l = pacientes().slice().sort(function (a, b) { return a.nome.localeCompare(b.nome); });
    return '<section class="afp-panel"><label class="afp-full"><span>Paciente</span><input class="afp-in" id="afp-pac" list="afp-pacl" autocomplete="off" placeholder="' + (l.length ? "Digite para buscar no cadastro" : "Nome do paciente") + '" value="' + esc(S.paciente) + '"></label>' +
      '<datalist id="afp-pacl">' + l.map(function (x) { return '<option value="' + esc(x.nome) + '">' + esc(x.cpf ? "CPF " + cpfFmt(x.cpf) : "") + "</option>"; }).join("") + "</datalist>" +
      (p ? '<div class="afp-pacsel">' + ic("ok", 16) + "<span><b>" + esc(p.nome) + "</b><small>" + esc([p.cpf ? "CPF " + cpfFmt(p.cpf) : "", telFmt(p.telefone), p.email].filter(Boolean).join(" · ") || "Cadastro sem contato") + "</small></span>" +
          '<button class="afp-icbtn" data-edpac aria-label="Editar paciente">' + ic("editar", 16) + "</button></div>"
        : '<button class="afp-link" data-novopac>' + ic("mais", 16) + (S.paciente ? " Cadastrar “" + esc(S.paciente) + "” como paciente" : " Cadastrar novo paciente") + "</button>") +
      '<p class="afp-hint">' + ic("escudo", 14) + "Pacientes cadastrados ficam só neste navegador. A receita emitida entra no histórico do paciente.</p></section>";
  }
  function wirePaciente(v, aoMudar) {
    var pac = v.querySelector("#afp-pac");
    pac.addEventListener("input", function () {
      S.paciente = pac.value; pac.classList.remove("afp-bad");
      var achou = pacientes().filter(function (x) { return norm(x.nome) === norm(pac.value.trim()); })[0], antes = S.pacId;
      S.pacId = achou ? achou.id : null;
      if (antes !== S.pacId) { render(); var n = S.el.querySelector("#afp-pac"); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } } else {
        var nb = v.querySelector("[data-novopac]"); if (nb) nb.innerHTML = ic("mais", 16) + (S.paciente.trim() ? " Cadastrar “" + esc(S.paciente.trim()) + "” como paciente" : " Cadastrar novo paciente");
        aoMudar();
      }
    });
    var np = v.querySelector("[data-novopac]"); if (np) np.addEventListener("click", function () {
      formPaciente(S.paciente ? { id: novoId(), nome: S.paciente, cpf: "", nascimento: "", telefone: "", email: "", obs: "", historico: [] } : null, function (p) { S.pacId = p.id; S.paciente = p.nome; render(); });
    });
    var ep = v.querySelector("[data-edpac]"); if (ep) ep.addEventListener("click", function () { formPaciente(pacAtual(), function (p) { S.paciente = p.nome; render(); }); });
  }

  /* ---------- carrinho de prescrição (fica à vista enquanto escolhe fórmulas) ---------- */
  function carrinho() {
    var old = document.querySelector(".afp-rxbar"); if (old) old.remove();
    if (!S.rx.length || ["formulas", "minhas", "laminas"].indexOf(S.tab) < 0) return;
    var b = document.createElement("div"); b.className = "afp-rxbar" + (S.cartOpen ? " on" : "");
    b.innerHTML = (S.cartOpen ? '<ul class="afp-rxbar-l">' + S.rx.map(function (f, i) {
        return '<li><span><b>' + esc(f.nome) + "</b><small>" + esc([f.forma, viaLabel(f)].filter(Boolean).join(" · ")) + '</small></span><button class="afp-icbtn" data-crm="' + i + '" aria-label="Remover">' + ic("x", 15) + "</button></li>";
      }).join("") + "</ul>" : "") +
      '<div class="afp-rxbar-h"><button class="afp-rxbar-t" data-ctog aria-expanded="' + !!S.cartOpen + '">' + ic("prescrever", 18) + "<span><b>Receita" + (S.paciente ? " de " + esc(S.paciente.split(" ")[0]) : "") + "</b><small>" + S.rx.length + (S.rx.length > 1 ? " fórmulas" : " fórmula") + "</small></span></button>" +
      '<button class="afp-btn" data-cgo>Ver receita →</button></div>';
    document.body.appendChild(b);
    b.querySelector("[data-ctog]").addEventListener("click", function () { S.cartOpen = !S.cartOpen; carrinho(); });
    b.querySelector("[data-cgo]").addEventListener("click", function () { S.cartOpen = false; irPara("prescrever"); });
    b.querySelectorAll("[data-crm]").forEach(function (x) { x.addEventListener("click", function () { S.rx.splice(+x.getAttribute("data-crm"), 1); saveRx(); render(); }); });
  }

  /* ---------- lâminas: baixar (PDF) e ampliar ---------- */
  function baixarLamina(l, btn) {
    var n = l.paginas || 0; if (!n) return;
    btn.disabled = true; var txt = btn.innerHTML; btn.innerHTML = "Preparando…";
    Promise.all(Array.from({ length: n }, function (_, i) { return pagina(l.n, i + 1); })).then(function (urls) {
      var w = document.getElementById("afp-print-root") || document.body.appendChild(Object.assign(document.createElement("div"), { id: "afp-print-root" }));
      w.innerHTML = '<div class="afp-lamprint">' + urls.map(function (u) { return '<img alt="" src="' + u + '">'; }).join("") + "</div>";
      var imgs = w.querySelectorAll("img");
      return Promise.all(Array.prototype.map.call(imgs, function (im) { return im.complete ? 0 : new Promise(function (r) { im.onload = im.onerror = r; }); }));
    }).then(function () {
      var t = document.title; document.title = "Lâmina técnica — " + l.titulo;
      imprimir(); setTimeout(function () { document.title = t; }, 1600);
    }).catch(function () { toast("Não foi possível baixar agora"); }).then(function () { btn.disabled = false; btn.innerHTML = txt; });
  }
  function ampliar(src, alt) {
    var z = 1, d = modal(alt, '<div class="afp-zoom"><img alt="' + esc(alt) + '" src="' + src + '"></div>',
      '<span></span><div class="afp-dlg-fa"><button class="afp-ghost" data-z="-1" aria-label="Diminuir">−</button><button class="afp-ghost" data-z="0">100%</button><button class="afp-ghost" data-z="1" aria-label="Aumentar">+</button></div>', 1100);
    var im = d.querySelector(".afp-zoom img"), lb = d.querySelector('[data-z="0"]');
    d.querySelectorAll("[data-z]").forEach(function (b) { b.addEventListener("click", function () {
      var k = +b.getAttribute("data-z"); z = k ? Math.max(1, Math.min(3, z + k * .5)) : 1; im.style.width = z * 100 + "%"; lb.textContent = Math.round(z * 100) + "%";
    }); });
  }

  window.AFPresc = { mount: mount };
})();
