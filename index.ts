// scrape-parfin-docs.ts
import puppeteer from "puppeteer";

interface Endpoint {
  tag: string;
  method: string;
  path: string;
  summary: string;
  description?: string;
  sectionId: string;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    // se der problema em alguns ambientes: args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  // Aumenta timeout global de navegação (opcional)
  page.setDefaultNavigationTimeout(120_000);

  const URL = "https://docs.parfin.io/#tag/Blockchain";
  console.log(`Acessando ${URL}...`);

  try {
    await page.goto(URL, {
      // "domcontentloaded" costuma ser suficiente para SPA
      waitUntil: "domcontentloaded",
      // se quiser simplesmente remover timeout da navegação:
      timeout: 0,
    });
  } catch (err) {
    console.warn(
      "Aviso: erro/timeout no goto, tentando continuar mesmo assim..."
    );
    console.warn(String(err));
  }

  // Dá um tempinho pro React/Redoc montar tudo
  await new Promise((resolve) => setTimeout(resolve, 4000));

  // Garante que a árvore de endpoints já apareceu
  await page
    .waitForSelector('div[id^="tag/"]', { timeout: 15000 })
    .catch(() =>
      console.warn(
        "Aviso: nenhum div[id^='tag/'] encontrado dentro do timeout."
      )
    );

  const endpoints: Endpoint[] = await page.evaluate(() => {
    const decodePointer = (pointer: string) =>
      pointer.replace(/~1/g, "/").replace(/~0/g, "~");

    const sections = Array.from(
      document.querySelectorAll<HTMLDivElement>('div[id^="tag/"]')
    );

    const result: Endpoint[] = [];

    for (const section of sections) {
      const sectionId = section.id; // ex: "tag/Report/paths/~1v1~1api~1counterparty~1report~1all/get"

      if (!sectionId) continue;

      const idParts = sectionId.split("/");
      const tag = idParts[1] ?? "Unknown";

      // HTTP method: <span class="http-verb get">get</span>
      const verbSpan = section.querySelector<HTMLSpanElement>("span.http-verb");
      const rawMethod = verbSpan?.textContent?.trim() ?? "";
      const method = rawMethod.toUpperCase();

      // Path: span logo ao lado do verbo HTTP
      let path = "";
      if (verbSpan?.nextElementSibling) {
        const pathSpan = verbSpan.nextElementSibling as HTMLElement;
        path = pathSpan.textContent?.trim() ?? "";
      }

      // Fallback: decodificar a partir do id se não achou o span
      if (!path && idParts.length >= 4) {
        const pointer = idParts[idParts.length - 2];
        path = decodePointer(pointer);
      }

      // Summary: <h2>Get all requested reports list</h2>
      const h2 = section.querySelector("h2");
      const summary = h2?.textContent?.trim() ?? "";

      // Descrição opcional: primeiro <p> do bloco
      const p = section.querySelector("div p");
      const description = p?.textContent?.trim();

      if (!path || !method) {
        continue;
      }

      result.push({
        tag,
        method,
        path,
        summary,
        description,
        sectionId,
      });
    }

    return result;
  });

  await browser.close();

  const uniqueMap = new Map<string, Endpoint>();
  for (const ep of endpoints) {
    const key = `${ep.method} ${ep.path}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, ep);
    }
  }

  const uniqueEndpoints = Array.from(uniqueMap.values()).sort((a, b) => {
    if (a.tag !== b.tag) return a.tag.localeCompare(b.tag);
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    return a.method.localeCompare(b.method);
  });

  console.log(JSON.stringify(uniqueEndpoints, null, 2));
})().catch((err) => {
  console.error("Erro ao rodar scraper:", err);
  process.exit(1);
});
