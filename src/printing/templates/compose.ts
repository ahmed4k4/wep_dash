/**
 * Section composer - turns a layout (ordered section ids) + context into
 * `RasterBlock[]` by dispatching each section id to its builder.
 *
 * This keeps ordering in `invoice-layout.ts` (pure data) and rendering in
 * `shared.ts` (pure builders). Templates (`full-invoice.ts` etc.) simply
 * pick a layout + resolve a config, then call `composeInvoice`.
 */

import type { RasterBlock } from "@/printing/renderer/raster";
import type { InvoiceSectionId } from "@/printing/invoice/invoice-types";
import {
  renderHeader,
  renderTitle,
  renderInvoiceMeta,
  renderCustomer,
  renderItems,
  renderNotes,
  renderTotals,
  renderFooter,
  separatorBlock,
  type TemplateContext,
} from "@/printing/templates/shared";

type SectionBuilder = (ctx: TemplateContext) => RasterBlock[];

const SECTION_BUILDERS: Record<InvoiceSectionId, SectionBuilder> = {
  header: (ctx) => [...renderHeader(ctx), separatorBlock(ctx)],
  title: renderTitle,
  invoiceMeta: renderInvoiceMeta,
  customer: renderCustomer,
  items: renderItems,
  notes: renderNotes,
  totals: renderTotals,
  footer: (ctx) => [separatorBlock(ctx), ...renderFooter(ctx)],
};

/**
 * Compose invoice blocks from an ordered list of section ids.
 * Unknown section ids are ignored (forward-compatible).
 */
export function composeInvoice(
  layout: InvoiceSectionId[],
  ctx: TemplateContext
): RasterBlock[] {
  const blocks: RasterBlock[] = [];
  for (const id of layout) {
    const builder = SECTION_BUILDERS[id];
    if (!builder) continue;
    blocks.push(...builder(ctx));
  }
  return blocks;
}