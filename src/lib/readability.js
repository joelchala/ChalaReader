/**
 * ChalaReadability — Motor local heurístico de extracción de contenido limpio.
 * Inspirado en el algoritmo Readability de Mozilla: puntúa bloques DOM por densidad
 * textual, peso semántico de etiquetas/clases y baja densidad de enlaces, limpia
 * nodos de ruido y sanitiza el HTML resultante sin dependencias ni red.
 *
 * Diseñado como IIFE idempotente compatible con múltiples inyecciones MV3.
 */
(function (globalScope) {
  "use strict";

  var REGEXPS = {
    unlikelyCandidates:
      /-ad-|ai2html|banner|breadcrumbs|combx|comment|community|cover-wrap|disqus|extra|footer|gdpr|header|legends|menu|related|remark|replies|rss|shoutbox|sidebar|skyscraper|social|sponsor|agegate|pagination|pager|popup|yom-remote|cookie|newsletter|share-buttons|promo|widget|toc-wrapper|modal|overlay/i,
    okMaybeItsACandidate:
      /and|article|body|column|content|main|shadow|post|entry|story|prose|markdown|readme/i,
    positive:
      /article|body|content|entry|hentry|h-entry|main|page|pagination|post|text|blog|story|prose|markdown|readme/i,
    negative:
      /-ad-|hidden|^hid$| hid$| hid |^hid |banner|combx|comment|com-|contact|foot|footer|footnote|gdpr|masthead|media|meta|outbrain|promo|related|scroll|share|shoutbox|sidebar|skyscraper|sponsor|shopping|tags|tool|widget|cookie|newsletter/i,
    byline: /byline|author|dateline|writtenby|p-author|vcard/i,
    divToPElements: /<(blockquote|dl|div|img|ol|p|pre|table|ul|section|article|h[1-6])\b/i,
    whitespace: /\s+/g,
    hasContent: /\S$/,
    commas: /[,，;؛]/g
  };

  var UNWANTED_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEMPLATE",
    "IFRAME",
    "FRAME",
    "FRAMESET",
    "OBJECT",
    "EMBED",
    "PARAM",
    "SVG",
    "CANVAS",
    "FORM",
    "INPUT",
    "TEXTAREA",
    "SELECT",
    "OPTION",
    "BUTTON",
    "DIALOG",
    "NAV",
    "ASIDE",
    "FOOTER",
    "MENU",
    "MENUITEM",
    "AUDIO",
    "VIDEO"
  ]);

  var ALLOWED_TAGS = new Set([
    "P",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "BLOCKQUOTE",
    "PRE",
    "CODE",
    "KBD",
    "SAMP",
    "VAR",
    "UL",
    "OL",
    "LI",
    "DL",
    "DT",
    "DD",
    "FIGURE",
    "FIGCAPTION",
    "IMG",
    "PICTURE",
    "SOURCE",
    "TABLE",
    "THEAD",
    "TBODY",
    "TFOOT",
    "TR",
    "TH",
    "TD",
    "CAPTION",
    "A",
    "STRONG",
    "B",
    "EM",
    "I",
    "U",
    "S",
    "DEL",
    "INS",
    "MARK",
    "SUP",
    "SUB",
    "SMALL",
    "ABBR",
    "CITE",
    "Q",
    "TIME",
    "BR",
    "HR",
    "DIV",
    "SPAN",
    "SECTION",
    "ARTICLE",
    "DETAILS",
    "SUMMARY"
  ]);

  var ALLOWED_ATTRS = new Set([
    "href",
    "src",
    "srcset",
    "alt",
    "title",
    "width",
    "height",
    "colspan",
    "rowspan",
    "datetime",
    "cite",
    "lang",
    "dir",
    "start",
    "type",
    "media"
  ]);

  function normalizeText(str) {
    return String(str || "")
      .replace(REGEXPS.whitespace, " ")
      .trim();
  }

  function getInnerText(node, normalize) {
    if (!node) return "";
    var text = node.textContent || "";
    return normalize === false ? text.trim() : normalizeText(text);
  }

  function getCharCount(node, ch) {
    var text = getInnerText(node, true);
    if (!text) return 0;
    if (!ch) return (text.match(REGEXPS.commas) || []).length;
    return text.split(ch).length - 1;
  }

  function getWordCount(text) {
    var clean = normalizeText(text);
    if (!clean) return 0;
    return clean.split(" ").filter(Boolean).length;
  }

  function estimateReadingTime(wordCount, wpm) {
    var rate = typeof wpm === "number" && wpm > 0 ? wpm : 220;
    if (!wordCount || wordCount <= 0) return 1;
    return Math.max(1, Math.ceil(wordCount / rate));
  }

  // El parser de URL elimina tabs/saltos de línea y caracteres de control, por lo que
  // "java\tscript:" termina siendo "javascript:". Se normaliza antes de validar el esquema.
  function hasUnsafeScheme(value) {
    var compact = String(value || "").replace(/[\u0000-\u0020\u007f]+/g, "").toLowerCase();
    return /^(javascript|vbscript):/.test(compact) || /^data:(?!image\/)/.test(compact);
  }

  function upperTag(node) {
    return node && node.tagName ? String(node.tagName).toUpperCase() : "";
  }

  function resolveUrl(rawUrl, baseURI) {
    var val = String(rawUrl || "").trim();
    if (!val) return "";
    if (hasUnsafeScheme(val)) return "";
    if (val.startsWith("data:") || val.startsWith("blob:")) return val;
    if (val.startsWith("#")) return val;
    try {
      var resolved = new URL(val, baseURI).href;
      return hasUnsafeScheme(resolved) ? "" : resolved;
    } catch {
      return "";
    }
  }

  function isProbablyHidden(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.hasAttribute && node.hasAttribute("hidden")) return true;
    var ariaHidden = node.getAttribute && node.getAttribute("aria-hidden");
    if (ariaHidden === "true") {
      var cls = String(node.className || "");
      if (!/math|katex|mjx/i.test(cls)) return true;
    }
    var style = String((node.getAttribute && node.getAttribute("style")) || "").toLowerCase();
    if (/display\s*:\s*none/.test(style) || /visibility\s*:\s*hidden/.test(style)) {
      return true;
    }
    return false;
  }

  function getClassWeight(node) {
    var weight = 0;
    if (!node || node.nodeType !== 1) return weight;
    var className = typeof node.className === "string" ? node.className : "";
    var id = typeof node.id === "string" ? node.id : "";

    if (className) {
      if (REGEXPS.negative.test(className)) weight -= 25;
      if (REGEXPS.positive.test(className)) weight += 25;
    }
    if (id) {
      if (REGEXPS.negative.test(id)) weight -= 25;
      if (REGEXPS.positive.test(id)) weight += 25;
    }
    return weight;
  }

  function getLinkDensity(node) {
    var textLength = getInnerText(node, true).length;
    if (textLength === 0) return 0;

    var linkLength = 0;
    var links = node.querySelectorAll ? node.querySelectorAll("a") : [];
    for (var i = 0; i < links.length; i += 1) {
      var link = links[i];
      var href = (link.getAttribute && link.getAttribute("href")) || "";
      var coefficient = href.startsWith("#") ? 0.3 : 1;
      linkLength += getInnerText(link, true).length * coefficient;
    }
    return linkLength / textLength;
  }

  function getTagInitialScore(tagName) {
    switch (tagName) {
      case "MAIN":
        return 12;
      case "ARTICLE":
        return 10;
      case "DIV":
      case "SECTION":
        return 5;
      case "PRE":
      case "TD":
      case "BLOCKQUOTE":
        return 3;
      case "ADDRESS":
      case "OL":
      case "UL":
      case "DL":
      case "DD":
      case "DT":
      case "LI":
      case "FORM":
        return -3;
      case "H1":
      case "H2":
      case "H3":
      case "H4":
      case "H5":
      case "H6":
      case "TH":
        return -5;
      default:
        return 0;
    }
  }

  function getMetaContent(doc, selectors) {
    for (var i = 0; i < selectors.length; i += 1) {
      var el = doc.querySelector(selectors[i]);
      if (el) {
        var content = (el.getAttribute("content") || el.textContent || "").trim();
        if (content) return normalizeText(content);
      }
    }
    return "";
  }

  function extractArticleTitle(doc) {
    var rawDocTitle = normalizeText(doc.title || "");
    var ogTitle = getMetaContent(doc, [
      'meta[property="og:title" i]',
      'meta[name="twitter:title" i]',
      'meta[name="dc:title" i]'
    ]);

    var curTitle = ogTitle || rawDocTitle;
    var h1 = doc.querySelector("article h1, main h1, h1");
    var h1Text = h1 ? normalizeText(h1.textContent) : "";

    if (!curTitle && h1Text) {
      return h1Text;
    }

    if (curTitle && /\s[|\-–—/»]\s/.test(curTitle)) {
      var parts = curTitle.split(/\s[|\-–—/»]\s/);
      if (parts.length > 1) {
        var candidate = parts[0].trim();
        if (getWordCount(candidate) >= 3) {
          curTitle = candidate;
        }
      }
    }

    if (h1Text && h1Text.length >= 12 && h1Text.length <= 180) {
      if (!curTitle || curTitle.toLowerCase().includes(h1Text.toLowerCase())) {
        return h1Text;
      }
    }

    return curTitle || h1Text || "Documento sin título";
  }

  function extractMetadata(doc, baseURI) {
    var title = extractArticleTitle(doc);
    var byline = getMetaContent(doc, [
      'meta[name="author" i]',
      'meta[property="article:author" i]',
      'meta[name="byl" i]',
      'meta[name="dc:creator" i]'
    ]);

    if (!byline) {
      var authorEl = doc.querySelector('[rel="author"], [itemprop="author"], .byline, .author');
      if (authorEl) {
        var candidateByline = normalizeText(authorEl.textContent);
        if (candidateByline && candidateByline.length <= 120) {
          byline = candidateByline;
        }
      }
    }

    var siteName = getMetaContent(doc, [
      'meta[property="og:site_name" i]',
      'meta[name="application-name" i]'
    ]);
    if (!siteName && baseURI) {
      try {
        siteName = new URL(baseURI).hostname.replace(/^www\./i, "");
      } catch {
        siteName = "";
      }
    }

    var publishedTime = getMetaContent(doc, [
      'meta[property="article:published_time" i]',
      'meta[name="pubdate" i]',
      'meta[name="publishdate" i]',
      'meta[name="date" i]'
    ]);
    if (!publishedTime) {
      var timeEl = doc.querySelector("article time[datetime], main time[datetime], time[datetime]");
      if (timeEl) {
        publishedTime = (timeEl.getAttribute("datetime") || timeEl.textContent || "").trim();
      }
    }

    var excerpt = getMetaContent(doc, [
      'meta[name="description" i]',
      'meta[property="og:description" i]',
      'meta[name="twitter:description" i]'
    ]);

    var docEl = doc.documentElement;
    // No inventar idioma: si la página no lo declara se deja vacío para no forzar "es"
    var lang = ((docEl && docEl.getAttribute("lang")) || "").trim();
    var dirAttr = ((docEl && docEl.getAttribute("dir")) || "").trim().toLowerCase();
    var bodyDir = ((doc.body && doc.body.getAttribute && doc.body.getAttribute("dir")) || "").trim().toLowerCase();
    var dir = /^(ltr|rtl|auto)$/.test(dirAttr) ? dirAttr : /^(ltr|rtl|auto)$/.test(bodyDir) ? bodyDir : "";

    return {
      title: title,
      byline: byline,
      siteName: siteName,
      publishedTime: publishedTime,
      excerpt: excerpt,
      lang: lang,
      dir: dir
    };
  }

  function prepDocument(doc) {
    if (!doc || !doc.body) return;

    var allElements = Array.from(doc.body.querySelectorAll("*"));
    for (var i = 0; i < allElements.length; i += 1) {
      var el = allElements[i];
      if (!el.parentNode) continue;

      // tagName de elementos SVG/MathML llega en minúsculas ("svg"): normalizar
      var tagName = upperTag(el);

      if (UNWANTED_TAGS.has(tagName) || isProbablyHidden(el)) {
        el.parentNode.removeChild(el);
        continue;
      }

      if (el.id === "chalareader-host") {
        el.parentNode.removeChild(el);
        continue;
      }

      if (tagName !== "BODY" && tagName !== "ARTICLE" && tagName !== "MAIN") {
        var matchString = (String(el.className || "") + " " + String(el.id || "")).trim();
        if (
          matchString &&
          REGEXPS.unlikelyCandidates.test(matchString) &&
          !REGEXPS.okMaybeItsACandidate.test(matchString)
        ) {
          // Proteger si contiene un artículo extenso dentro
          var nestedTextLen = getInnerText(el, true).length;
          if (nestedTextLen < 800 || !el.querySelector("article, main, p")) {
            el.parentNode.removeChild(el);
            continue;
          }
        }
      }
    }

    // Convertir <div> sin elementos de bloque en <p> para mejorar la puntuación
    var divs = Array.from(doc.body.querySelectorAll("div"));
    for (var j = 0; j < divs.length; j += 1) {
      var div = divs[j];
      if (!div.parentNode) continue;
      if (!REGEXPS.divToPElements.test(div.innerHTML || "")) {
        var text = getInnerText(div, true);
        if (text.length >= 25) {
          var p = doc.createElement("p");
          while (div.firstChild) {
            p.appendChild(div.firstChild);
          }
          div.parentNode.replaceChild(p, div);
        }
      }
    }
  }

  function getAncestors(node, maxDepth) {
    var ancestors = [];
    var i = 0;
    var current = node ? node.parentNode : null;
    while (current && current.nodeType === 1 && current.tagName !== "HTML") {
      ancestors.push(current);
      i += 1;
      if (maxDepth && i >= maxDepth) break;
      current = current.parentNode;
    }
    return ancestors;
  }

  function scoreContentCandidates(doc) {
    var scoreMap = new Map();
    var candidates = [];

    function ensureCandidate(el) {
      if (!scoreMap.has(el)) {
        var initial = getTagInitialScore(el.tagName) + getClassWeight(el);
        var entry = { node: el, score: initial };
        scoreMap.set(el, entry);
        candidates.push(entry);
      }
      return scoreMap.get(el);
    }

    var elementsToScore = doc.body.querySelectorAll("p, pre, td, blockquote, li");
    for (var i = 0; i < elementsToScore.length; i += 1) {
      var element = elementsToScore[i];
      if (!element.parentNode) continue;

      var innerText = getInnerText(element, true);
      if (innerText.length < 25) continue;

      var ancestors = getAncestors(element, 5);
      if (ancestors.length === 0) continue;

      var contentScore = 1;
      contentScore += getCharCount(element);
      contentScore += Math.min(Math.floor(innerText.length / 100), 3);
      if (element.tagName === "P") {
        contentScore += 1;
      }

      for (var level = 0; level < ancestors.length; level += 1) {
        var ancestor = ancestors[level];
        if (!ancestor.tagName) continue;
        var entry = ensureCandidate(ancestor);
        var divider = level === 0 ? 1 : level === 1 ? 2 : level * 3;
        entry.score += contentScore / divider;
      }
    }

    for (var k = 0; k < candidates.length; k += 1) {
      var cand = candidates[k];
      var linkDensity = getLinkDensity(cand.node);
      cand.score = cand.score * (1 - linkDensity);
    }

    candidates.sort(function (a, b) {
      return b.score - a.score;
    });

    return {
      topCandidate: candidates[0] || null,
      scoreMap: scoreMap
    };
  }

  function collectArticleContent(doc, topCandidateObj, scoreMap) {
    var articleContainer = doc.createElement("div");
    articleContainer.setAttribute("data-chalareader-root", "1");

    if (!topCandidateObj || !topCandidateObj.node) {
      var semanticFallback = doc.body.querySelector("article, main, [role='main']") || doc.body;
      if (semanticFallback) {
        articleContainer.innerHTML = semanticFallback.innerHTML;
      }
      return articleContainer;
    }

    var topNode = topCandidateObj.node;
    var topScore = Math.max(10, topCandidateObj.score);
    var parent = topNode.parentNode;

    if (!parent || parent.tagName === "HTML" || parent.tagName === "BODY") {
      articleContainer.appendChild(topNode.cloneNode(true));
      return articleContainer;
    }

    var siblingScoreThreshold = Math.max(10, topScore * 0.2);
    var topClassName = typeof topNode.className === "string" ? topNode.className.trim() : "";
    var siblings = Array.from(parent.children || []);

    for (var i = 0; i < siblings.length; i += 1) {
      var sibling = siblings[i];
      var append = false;

      if (sibling === topNode) {
        append = true;
      } else {
        var contentBonus = 0;
        var sibClass = typeof sibling.className === "string" ? sibling.className.trim() : "";
        if (topClassName && sibClass === topClassName) {
          contentBonus += topScore * 0.2;
        }

        var sibEntry = scoreMap.get(sibling);
        if (sibEntry && sibEntry.score + contentBonus >= siblingScoreThreshold) {
          append = true;
        } else if (sibling.tagName === "P") {
          var linkDensity = getLinkDensity(sibling);
          var text = getInnerText(sibling, true);
          var len = text.length;
          if (len > 80 && linkDensity < 0.25) {
            append = true;
          } else if (len > 0 && len <= 80 && linkDensity === 0 && /\.( |$)/.test(text)) {
            append = true;
          }
        } else if (
          /^(H2|H3|H4|H5|H6|FIGURE|PRE|BLOCKQUOTE|UL|OL|TABLE)$/.test(sibling.tagName) &&
          getLinkDensity(sibling) < 0.35 &&
          getInnerText(sibling, true).length >= 10
        ) {
          append = true;
        }
      }

      if (append) {
        articleContainer.appendChild(sibling.cloneNode(true));
      }
    }

    if (articleContainer.children.length === 0) {
      articleContainer.appendChild(topNode.cloneNode(true));
    }

    return articleContainer;
  }

  function hasDataTableAttributes(table) {
    if (!table) return false;
    var rows = table.querySelectorAll("tr").length;
    var cols = table.querySelectorAll("th, td").length;
    return rows >= 2 && cols >= 4;
  }

  function cleanArticleNode(doc, root, baseURI, articleTitle) {
    // 1. Eliminar posible H1 redundante al principio si coincide con el título extraído
    var firstHeading = root.querySelector("h1");
    if (firstHeading && articleTitle) {
      var h1Text = normalizeText(firstHeading.textContent).toLowerCase();
      var titleNorm = normalizeText(articleTitle).toLowerCase();
      if (h1Text === titleNorm || titleNorm.includes(h1Text)) {
        firstHeading.parentNode.removeChild(firstHeading);
      }
    }

    // 2. Limpieza condicional de contenedores ruidosos
    var conditionalBlocks = Array.from(root.querySelectorAll("table, ul, ol, div, section, aside"));
    for (var i = 0; i < conditionalBlocks.length; i += 1) {
      var block = conditionalBlocks[i];
      if (!block.parentNode) continue;

      if (block.tagName === "TABLE" && hasDataTableAttributes(block)) {
        continue;
      }

      var weight = getClassWeight(block);
      if (weight < 0) {
        block.parentNode.removeChild(block);
        continue;
      }

      var text = getInnerText(block, true);
      var textLen = text.length;
      var commas = getCharCount(block);
      var linkDensity = getLinkDensity(block);
      var imgCount = block.querySelectorAll("img").length;
      var pCount = block.querySelectorAll("p").length;

      if (commas < 10 && textLen > 0) {
        if (linkDensity > 0.5 && pCount <= 1 && imgCount === 0) {
          block.parentNode.removeChild(block);
          continue;
        }
      }

      if (textLen === 0 && imgCount === 0 && !block.querySelector("hr, br, pre, code")) {
        block.parentNode.removeChild(block);
      }
    }

    // 3. Sanitizar etiquetas y atributos de todo el subárbol
    var nodes = Array.from(root.querySelectorAll("*"));
    for (var j = 0; j < nodes.length; j += 1) {
      var node = nodes[j];
      if (!node.parentNode) continue;

      var nodeTag = upperTag(node);
      if (!ALLOWED_TAGS.has(nodeTag)) {
        if (UNWANTED_TAGS.has(nodeTag)) {
          node.parentNode.removeChild(node);
        } else {
          // Desenvolver etiquetas desconocidas conservando su texto/hijos
          var parent = node.parentNode;
          while (node.firstChild) {
            parent.insertBefore(node.firstChild, node);
          }
          parent.removeChild(node);
        }
        continue;
      }

      // Resolver atributos permitidos y limpiar eventos / estilos en línea
      var attrs = Array.from(node.attributes || []);
      for (var a = 0; a < attrs.length; a += 1) {
        var attrName = attrs[a].name.toLowerCase();
        var attrVal = attrs[a].value;

        if (!ALLOWED_ATTRS.has(attrName) || attrName.startsWith("on")) {
          node.removeAttribute(attrs[a].name);
          continue;
        }

        if (attrName === "href") {
          var safeHref = resolveUrl(attrVal, baseURI);
          if (!safeHref) {
            node.removeAttribute("href");
          } else {
            node.setAttribute("href", safeHref);
            if (!safeHref.startsWith("#")) {
              node.setAttribute("target", "_blank");
              node.setAttribute("rel", "noopener noreferrer");
            }
          }
        } else if (attrName === "src") {
          var safeSrc = resolveUrl(attrVal, baseURI);
          if (!safeSrc) {
            node.removeAttribute("src");
          } else {
            node.setAttribute("src", safeSrc);
          }
        } else if (attrName === "srcset") {
          var fixedSet = String(attrVal || "")
            .split(",")
            .map(function (item) {
              var trimmed = item.trim();
              if (!trimmed) return "";
              var pieces = trimmed.split(/\s+/);
              pieces[0] = resolveUrl(pieces[0], baseURI);
              return pieces[0] ? pieces.join(" ") : "";
            })
            .filter(Boolean)
            .join(", ");
          if (fixedSet) {
            node.setAttribute("srcset", fixedSet);
          } else {
            node.removeAttribute("srcset");
          }
        }
      }

      if (nodeTag === "IMG") {
        var finalSrc = node.getAttribute("src") || "";
        if (!finalSrc) {
          node.parentNode.removeChild(node);
          continue;
        }
        node.setAttribute("loading", "lazy");
      }
    }

    // 4. Eliminar encabezados vacíos o párrafos sin texto ni multimedia
    var cleanupTargets = Array.from(root.querySelectorAll("p, h1, h2, h3, h4, h5, h6, blockquote"));
    for (var c = 0; c < cleanupTargets.length; c += 1) {
      var target = cleanupTargets[c];
      if (!target.parentNode) continue;
      if (getInnerText(target, true).length === 0 && !target.querySelector("img, picture, code, pre")) {
        target.parentNode.removeChild(target);
      }
    }

    return root;
  }

  /**
   * Extrae el artículo principal limpio desde un Document (idealmente un clon).
   * @param {Document} doc
   * @param {{ baseURI?: string, wordsPerMinute?: number }} [options]
   */
  function parseDocument(doc, options) {
    var opts = options || {};
    var baseURI = opts.baseURI || (doc && (doc.baseURI || doc.URL)) || "https://localhost/";
    var wpm = opts.wordsPerMinute || 220;

    if (!doc || !doc.body) {
      return {
        title: "ChalaReader",
        byline: "",
        siteName: "",
        publishedTime: "",
        excerpt: "",
        lang: "",
        dir: "",
        contentHtml: "<p></p>",
        textContent: "",
        length: 0,
        wordCount: 0,
        readingTimeMinutes: 1,
        isFallback: true
      };
    }

    var metadata = extractMetadata(doc, baseURI);
    prepDocument(doc);

    var scoring = scoreContentCandidates(doc);
    var articleNode = collectArticleContent(doc, scoring.topCandidate, scoring.scoreMap);
    cleanArticleNode(doc, articleNode, baseURI, metadata.title);

    var textContent = getInnerText(articleNode, true);
    var isFallback = false;

    // Fallback si el candidato principal quedó demasiado corto respecto al cuerpo disponible
    if (textContent.length < 120) {
      var bodyText = getInnerText(doc.body, true);
      if (bodyText.length > textContent.length) {
        var fallbackRoot = doc.createElement("div");
        fallbackRoot.innerHTML = doc.body.innerHTML;
        cleanArticleNode(doc, fallbackRoot, baseURI, metadata.title);
        var fallbackText = getInnerText(fallbackRoot, true);
        if (fallbackText.length > textContent.length) {
          articleNode = fallbackRoot;
          textContent = fallbackText;
        }
      }
      isFallback = textContent.length < 120;
    }

    var wordCount = getWordCount(textContent);
    var readingTimeMinutes = estimateReadingTime(wordCount, wpm);

    return {
      title: metadata.title,
      byline: metadata.byline,
      siteName: metadata.siteName,
      publishedTime: metadata.publishedTime,
      excerpt: metadata.excerpt,
      lang: metadata.lang,
      dir: metadata.dir,
      contentHtml: articleNode.innerHTML,
      textContent: textContent,
      length: textContent.length,
      wordCount: wordCount,
      readingTimeMinutes: readingTimeMinutes,
      isFallback: isFallback
    };
  }

  globalScope.ChalaReadability = {
    parse: parseDocument,
    extractArticle: parseDocument,
    getWordCount: getWordCount,
    estimateReadingTime: estimateReadingTime
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
