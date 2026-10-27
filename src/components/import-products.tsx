"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  FileSpreadsheet,
  ImagePlus,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, uploadImage } from "@/lib/supabase";
import { detectMarket, productSchema, rupiah } from "@/lib/domain";
import { Button } from "./ui/button";
const columns = [
  "sku",
  "name",
  "category",
  "cogs",
  "image_url",
  "shopee_url",
  "tokopedia_url",
  "tiktokshop_url",
  "lazada_url",
] as const;
type Row = Record<string, string> & { _key: string; _skip: string };
export function rowErrors(row: Record<string, string>, duplicate = false) {
  const errors: string[] = [];
  const p = productSchema.safeParse({
    sku: row.sku,
    name: row.name,
    category: row.category || "",
    cogs: row.cogs,
  });
  if (!p.success)
    errors.push(
      ...p.error.issues.map((i) => `${String(i.path[0])}: ${i.message}`),
    );
  if (duplicate) errors.push("Duplicate SKU in this file");
  for (const key of [
    "shopee_url",
    "tokopedia_url",
    "tiktokshop_url",
    "lazada_url",
  ]) {
    if (!row[key]) continue;
    try {
      const m = detectMarket(row[key]);
      if (m !== key.replace("_url", ""))
        errors.push(`${key}: URL belongs to ${m}`);
    } catch {
      errors.push(`${key}: invalid marketplace HTTPS URL`);
    }
  }
  if (row.image_url) {
    try {
      const u = new URL(row.image_url);
      if (u.protocol !== "https:") throw Error();
    } catch {
      errors.push("image_url: use an HTTPS image URL");
    }
  }
  return errors;
}
export default function ImportProducts({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Row[]>([]),
    [images, setImages] = useState<Map<string, File>>(new Map()),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [done, setDone] = useState(false),
    [page, setPage] = useState(0),
    [failed, setFailed] = useState<Record<string, string>>({}),
    [completed, setCompleted] = useState<Set<string>>(new Set());
  const paths = useRef(new Map<string, string>());
  const [filename, setFilename] = useState("");
  const validation = useMemo(() => {
    const counts = new Map<string, number>();
    rows
      .filter((r) => !r._skip)
      .forEach((r) => counts.set(r.sku, (counts.get(r.sku) || 0) + 1));
    return new Map(
      rows.map((r) => [r._key, rowErrors(r, (counts.get(r.sku) || 0) > 1)]),
    );
  }, [rows]);
  const active = rows.filter((r) => !r._skip),
    valid = active.filter((r) => !validation.get(r._key)?.length);
  async function template(type: "csv" | "xlsx") {
    const sheet = XLSX.utils.json_to_sheet(
      [
        {
          sku: "SKU001",
          name: "Kopi Arabika 250g",
          category: "Coffee",
          cogs: 45000,
          image_url: "",
          shopee_url: "",
          tokopedia_url: "",
          tiktokshop_url: "",
          lazada_url: "",
        },
      ],
      { header: [...columns] },
    );
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Products");
    XLSX.writeFile(book, "priceradar-template." + type, { bookType: type });
  }
  async function readSheet(file: File) {
    if (!/\.(csv|xlsx)$/i.test(file.name)) {
      toast.error("Choose a CSV or XLSX file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Spreadsheet must be under 10 MB.");
      return;
    }
    try {
      const book = XLSX.read(await file.arrayBuffer(), {
        type: "array",
        sheetRows: 5002,
      });
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        book.Sheets[book.SheetNames[0]],
        { defval: "" },
      );
      if (!raw.length) throw Error("The file has no product rows.");
      if (raw.length > 5000)
        throw Error("Import up to 5,000 products per file.");
      if (
        !["sku", "name", "cogs"].every((k) => Object.keys(raw[0]).includes(k))
      )
        throw Error(
          "Required headers: sku, name, cogs. Download the template first.",
        );
      setRows(
        raw.map((r) => ({
          ...Object.fromEntries(
            columns.map((k) => [k, String(r[k] ?? "").trim()]),
          ),
          _key: crypto.randomUUID(),
          _skip: "",
        })),
      );
      setFilename(file.name);
      setFailed({});
      setCompleted(new Set());
      setDone(false);
      paths.current.clear();
      setProgress(0);
      setPage(0);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function readImages(files: FileList | File[]) {
    try {
      const additions = new Map<string, File>();
      let total = 0;
      for (const f of Array.from(files)) {
        if (f.name.toLowerCase().endsWith(".zip")) {
          if (f.size > 50 * 1024 * 1024)
            throw Error("ZIP must be under 50 MB.");
          const zip = await JSZip.loadAsync(f);
          const entries = Object.values(zip.files).filter(
            (e) => !e.dir && !e.name.includes("__MACOSX"),
          );
          if (entries.length > 1000)
            throw Error("ZIP supports up to 1,000 image files.");
          for (const entry of entries) {
            const ext = entry.name.split(".").pop()?.toLowerCase();
            if (!["jpg", "jpeg", "png", "webp"].includes(ext || "")) continue;
            const size = (entry as any)._data?.uncompressedSize;
            if (size > 5 * 1024 * 1024)
              throw Error("Each image must be under 5 MB.");
            total += size || 0;
            if (total > 100 * 1024 * 1024)
              throw Error(
                "ZIP expanded images exceed 100 MB. Split into smaller ZIPs.",
              );
            const blob = await entry.async("blob");
            if (blob.size > 5 * 1024 * 1024) throw Error("Image exceeds 5 MB.");
            const name = entry.name.split("/").pop()!;
            additions.set(
              name.replace(/\.[^.]+$/, "").toLowerCase(),
              new File([blob], name, {
                type:
                  ext === "jpg" || ext === "jpeg"
                    ? "image/jpeg"
                    : "image/" + ext,
              }),
            );
          }
        } else {
          if (!["image/jpeg", "image/png", "image/webp"].includes(f.type))
            continue;
          if (f.size > 5 * 1024 * 1024) throw Error(`${f.name} exceeds 5 MB.`);
          additions.set(f.name.replace(/\.[^.]+$/, "").toLowerCase(), f);
        }
      }
      setImages((old) => new Map([...old, ...additions]));
      toast.success(
        `${additions.size} images loaded; matching by SKU filename.`,
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  function update(key: string, column: string, value: string) {
    setRows((old) =>
      old.map((r) => (r._key === key ? { ...r, [column]: value } : r)),
    );
  }
  async function imageFor(r: Row) {
    if (paths.current.has(r._key)) return paths.current.get(r._key)!;
    let file = images.get(r.sku.toLowerCase());
    if (!file && r.image_url) {
      let res: Response;
      try {
        res = await fetch(r.image_url, {
          credentials: "omit",
          referrerPolicy: "no-referrer",
          signal: AbortSignal.timeout(15000),
        });
      } catch {
        throw Error(
          "Image URL could not be downloaded. Upload a SKU-named image instead (the host may block browser downloads).",
        );
      }
      if (!res.ok) throw Error("Image URL download failed");
      const blob = await res.blob();
      file = new File([blob], r.sku, { type: blob.type });
    }
    if (!file) return null;
    const path = await uploadImage(file, userId);
    paths.current.set(r._key, path);
    return path;
  }
  async function commit() {
    if (valid.length !== active.length) {
      toast.error("Fix errors or skip invalid rows first.");
      return;
    }
    setBusy(true);
    setDone(false);
    const errors: Record<string, string> = {};
    const success = new Set(completed);
    let processed = 0;
    const pending = valid.filter((r) => !completed.has(r._key));
    try {
      for (let offset = 0; offset < pending.length; offset += 100) {
        const chunk = pending.slice(offset, offset + 100),
          ready: { row: Row; product: any }[] = [];
        for (const row of chunk) {
          try {
            const path = await imageFor(row);
            ready.push({
              row,
              product: {
                sku: row.sku,
                name: row.name,
                category: row.category,
                cogs: Number(row.cogs),
                ...(path ? { image_path: path } : {}),
              },
            });
          } catch (e) {
            errors[row._key] = (e as Error).message;
            processed++;
          }
        }
        if (ready.length) {
          try {
            const r = await api<{ data: any[] }>("products", {
              method: "POST",
              body: JSON.stringify(ready.map((x) => x.product)),
            });
            const bySku = new Map(r.data.map((p) => [p.sku, p]));
            for (const { row } of ready) {
              try {
                const product = bySku.get(row.sku);
                if (!product) throw Error("Product was not returned.");
                for (const col of [
                  "shopee_url",
                  "tokopedia_url",
                  "tiktokshop_url",
                  "lazada_url",
                ])
                  if (row[col])
                    await api("listings", {
                      method: "POST",
                      body: JSON.stringify({
                        product_id: product.id,
                        url: row[col],
                        match_status: "confirmed",
                      }),
                    });
                success.add(row._key);
              } catch (e) {
                errors[row._key] = (e as Error).message;
              }
              processed++;
              setProgress(
                Math.round((processed / Math.max(1, pending.length)) * 100),
              );
            }
          } catch (e) {
            for (const { row } of ready) {
              errors[row._key] = (e as Error).message;
              processed++;
            }
          }
        }
        setCompleted(new Set(success));
        setFailed({ ...errors });
        setProgress(
          Math.round((processed / Math.max(1, pending.length)) * 100),
        );
      }
      setDone(!Object.keys(errors).length);
      if (Object.keys(errors).length)
        toast.error(
          `${Object.keys(errors).length} rows need attention. Successful rows are saved; retry only retries unfinished rows.`,
        );
      else toast.success(`${success.size} products imported.`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link
        href="/products"
        className="flex gap-1 items-center muted text-xs mb-5"
      >
        <ArrowLeft size={13} />
        Back to products
      </Link>
      <div className="eyebrow mb-2">Less typing. More tracking.</div>
      <h1 className="text-[28px] font-bold tracking-tight mb-2">
        Import your products
      </h1>
      <p className="muted mb-7">
        Bring your catalog, costs, images, and competitor URLs together.
      </p>
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {[
          ["01", "Get the template", "Start with our CSV or Excel format."],
          ["02", "Upload & review", "Match your images and fix any errors."],
          [
            "03",
            "Import your catalog",
            "Save products and confirmed listings.",
          ],
        ].map(([n, t, d]) => (
          <div key={n} className="panel p-5 flex gap-4">
            <span className="badge h-fit">{n}</span>
            <div>
              <h3 className="font-bold mb-1 text-sm">{t}</h3>
              <p className="muted text-xs">{d}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="panel p-6 mb-5">
        <div className="flex flex-wrap justify-between gap-4 items-center mb-5">
          <div>
            <h2 className="font-bold">Start with a spreadsheet</h2>
            <p className="text-xs muted mt-1">
              Required: SKU, name, COGS · up to 5,000 rows · existing SKUs are
              updated
            </p>
          </div>
          <div className="flex gap-2">
            <Button className="secondary" onClick={() => template("csv")}>
              <Download size={14} />
              CSV template
            </Button>
            <Button className="secondary" onClick={() => template("xlsx")}>
              <Download size={14} />
              Excel template
            </Button>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div
            className="dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!busy && e.dataTransfer.files[0])
                readSheet(e.dataTransfer.files[0]);
            }}
          >
            <label className="cursor-pointer !mb-0">
              <FileSpreadsheet
                className="mx-auto mb-3"
                size={28}
                style={{ color: "var(--accent)" }}
              />
              <span className="block mb-2">
                {filename || "Drop your CSV or XLSX here"}
              </span>
              <span className="text-xs muted font-normal">
                or click to choose · up to 10 MB
              </span>
              <input
                type="file"
                className="sr-only"
                disabled={busy}
                accept=".csv,.xlsx"
                onChange={(e) =>
                  e.target.files?.[0] && readSheet(e.target.files[0])
                }
              />
            </label>
          </div>
          <div
            className="dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!busy) readImages(e.dataTransfer.files);
            }}
          >
            <label className="cursor-pointer !mb-0">
              <ImagePlus
                className="mx-auto mb-3"
                size={28}
                style={{ color: "var(--accent)" }}
              />
              <span className="block mb-2">
                {images.size
                  ? `${images.size} images ready`
                  : "Add product images or a ZIP"}
              </span>
              <span className="text-xs muted font-normal">
                Name images by SKU, e.g. SKU001.jpg · max 5 MB each
              </span>
              <input
                type="file"
                className="sr-only"
                disabled={busy}
                multiple
                accept="image/jpeg,image/png,image/webp,.zip"
                onChange={(e) => e.target.files && readImages(e.target.files)}
              />
            </label>
          </div>
        </div>
        <p className="text-xs muted mt-4">
          Marketplace URLs in this import are treated as matches you have
          confirmed. Double-check variants and pack sizes. Uploaded product
          images are public.
        </p>
      </div>
      {rows.length > 0 && (
        <section className="panel">
          <div className="p-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-bold">Review before importing</h2>
              <p className="muted text-xs mt-1">
                {valid.length} valid · {active.length - valid.length} need fixes
                · {rows.length - active.length} skipped · {completed.size}{" "}
                imported
              </p>
            </div>
            <Button
              disabled={
                busy || !valid.length || valid.length !== active.length || done
              }
              onClick={commit}
            >
              {busy ? (
                "Importing…"
              ) : done ? (
                <>
                  <Check size={15} />
                  Imported
                </>
              ) : (
                "Import " + valid.length + " products"
              )}
              {!busy && !done && <ArrowRight size={14} />}
            </Button>
          </div>
          {(busy || progress > 0) && (
            <div className="px-5 pb-4">
              <div
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2 rounded-full overflow-hidden"
                style={{ background: "var(--line)" }}
              >
                <div
                  className="h-full transition-all"
                  style={{ width: progress + "%", background: "var(--accent)" }}
                />
              </div>
              <p className="text-xs muted mt-2">
                {progress}% · Products commit in chunks of 100. Keep this tab
                open.
              </p>
            </div>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Skip</th>
                  <th>Image</th>
                  {columns.map((c) => (
                    <th key={c}>{c.replaceAll("_", " ")}</th>
                  ))}
                  <th>Validation</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(page * 50, page * 50 + 50).map((r) => {
                  const file = images.get(r.sku.toLowerCase());
                  return (
                    <tr key={r._key} style={{ opacity: r._skip ? 0.5 : 1 }}>
                      <td>
                        <input
                          aria-label={"Skip " + r.sku}
                          type="checkbox"
                          className="!w-4"
                          checked={Boolean(r._skip)}
                          disabled={busy || completed.has(r._key)}
                          onChange={(e) =>
                            update(r._key, "_skip", e.target.checked ? "1" : "")
                          }
                        />
                      </td>
                      <td>
                        {file ? (
                          <Preview file={file} />
                        ) : r.image_url ? (
                          <img
                            className="row-image"
                            alt="Product preview"
                            referrerPolicy="no-referrer"
                            src={r.image_url}
                          />
                        ) : (
                          <span className="muted text-xs">No image</span>
                        )}
                      </td>
                      {columns.map((c) => (
                        <td key={c} className="!p-1">
                          <input
                            aria-label={`${r.sku} ${c}`}
                            className={
                              "input-cell " + (c === "name" ? "!w-52" : "!w-36")
                            }
                            disabled={busy || completed.has(r._key)}
                            value={r[c]}
                            onChange={(e) => update(r._key, c, e.target.value)}
                          />
                        </td>
                      ))}
                      <td className="text-xs !whitespace-normal min-w-52">
                        {completed.has(r._key) ? (
                          <span className="badge">Imported</span>
                        ) : failed[r._key] ? (
                          <span className="text-red-500">{failed[r._key]}</span>
                        ) : validation.get(r._key)?.length ? (
                          <span className="text-red-500">
                            {validation.get(r._key)?.join("; ")}
                          </span>
                        ) : (
                          <span className="badge">Ready</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="p-4 flex items-center justify-end gap-3">
            <span className="muted text-xs">
              Page {page + 1} / {Math.ceil(rows.length / 50)}
            </span>
            <Button
              className="secondary"
              disabled={!page}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              className="secondary"
              disabled={(page + 1) * 50 >= rows.length}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
          {done && (
            <div
              className="p-5 border-t"
              style={{ borderColor: "var(--line)" }}
            >
              <Link href="/products" className="btn">
                View your catalog
                <ArrowRight size={14} />
              </Link>
            </div>
          )}
        </section>
      )}
    </>
  );
}
function Preview({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <img className="row-image" src={url || undefined} alt="Product preview" />
  );
}
