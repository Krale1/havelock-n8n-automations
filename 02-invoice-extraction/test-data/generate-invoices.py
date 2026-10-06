"""
Generates the synthetic supplier invoices used to test the extraction workflow.

Everything here is invented. No real vendors, no real customer data.

Invoices 1-5 are PDFs with a real text layer.
Invoice 6 is a deliberately degraded PNG - rasterised, low contrast, skewed and
clipped - so that Claude has to read pixels rather than an embedded text layer.
That is the only way to genuinely exercise the confidence_notes path.

Run:  python generate-invoices.py
Out:  ./invoices/*.pdf, ./invoices/*.png, ./invoices/manifest.json
"""

import json
import os
import random

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from PIL import Image, ImageDraw, ImageFont, ImageEnhance, ImageFilter
import numpy as np

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "invoices")
PAGE_W, PAGE_H = A4
TAX_RATE = 0.085
CURRENCY = "USD"

random.seed(20260922)


# --------------------------------------------------------------------------
# Invoice definitions
# --------------------------------------------------------------------------

def money(v):
    return f"{v:,.2f}"


INVOICES = [
    {
        "file": "invoice-01-clean",
        "vendor": "Marlow Stationery Ltd",
        "vendor_addr": ["Unit 7, Calder Business Park", "Ashford, OH 44412", "(330) 555-0142"],
        "bill_to": ["Brightside Dental Practice", "14 Weaver Street", "Ashford, OH 44410"],
        "number": "MS-20841",
        "date": "2026-08-14",
        "due": "2026-09-13",
        "items": [
            ("Copier paper A4, 80gsm (ream)", 20, 6.50),
        ],
        "stated_subtotal": None,   # None = use the real sum
        "expect": "auto_processed",
        "why": "One line item, clean arithmetic, well under the review threshold.",
    },
    {
        "file": "invoice-02-multi-line",
        "vendor": "Kesterly Print & Signage",
        "vendor_addr": ["221 Foundry Road", "Ashford, OH 44411", "(330) 555-0198"],
        "bill_to": ["Brightside Dental Practice", "14 Weaver Street", "Ashford, OH 44410"],
        "number": "KP-3307",
        "date": "2026-08-22",
        "due": "2026-09-21",
        "items": [
            ("Design work - waiting room signage", 8, 95.00),
            ("Foamex panel, 1200x800mm", 1, 120.00),
            ("Vinyl lettering, per metre", 3, 15.00),
        ],
        "stated_subtotal": None,
        "expect": "auto_processed",
        "why": "Three line items that sum correctly to the subtotal, tax adds up, under threshold.",
    },
    {
        "file": "invoice-03-sum-mismatch",
        "vendor": "Alder & Finch Supplies",
        "vendor_addr": ["9 Tanner's Yard", "Kelby, OH 44502", "(330) 555-0067"],
        "bill_to": ["Brightside Dental Practice", "14 Weaver Street", "Ashford, OH 44410"],
        "number": "AF-11290",
        "date": "2026-08-27",
        "due": "2026-09-26",
        "items": [
            ("Nitrile gloves, box of 100", 6, 70.00),
            ("Surface disinfectant, 5L", 1, 185.00),
        ],
        # Line items really sum to 605.00 - the invoice claims 745.00.
        "stated_subtotal": 745.00,
        "expect": "needs_review",
        "why": "Line items sum to 605.00 but the invoice states a subtotal of 745.00 - a 140.00 discrepancy.",
    },
    {
        "file": "invoice-04-missing-fields",
        "vendor": None,          # no clear vendor name - just a phone number
        "vendor_addr": ["TEL 330-555-0231", "THANK YOU FOR YOUR CUSTOM"],
        "bill_to": None,
        "number": None,
        "date": None,            # no readable date anywhere
        "due": None,
        "items": [
            ("MISC HARDWARE", 1, 28.40),
            ("SUNDRY", 1, 19.40),
        ],
        "stated_subtotal": None,
        "style": "receipt",
        "expect": "needs_review",
        "why": "No vendor name and no invoice date on the document - both are required fields.",
    },
    {
        "file": "invoice-05-large",
        "vendor": "Thornwood Facilities Group",
        "vendor_addr": ["Thornwood House, 40 Pike Lane", "Brenner, OH 44518", "(330) 555-0310"],
        "bill_to": ["Brightside Dental Practice", "14 Weaver Street", "Ashford, OH 44410"],
        "number": "TFG-88214",
        "date": "2026-09-01",
        "due": "2026-10-01",
        "items": [
            ("Surgery refurbishment - labour", 1, 4800.00),
            ("Flooring, supply and fit", 1, 1150.00),
            ("Waste removal and disposal", 1, 600.00),
        ],
        "stated_subtotal": None,
        "expect": "needs_review",
        "why": "Arithmetic is perfect, but the total is over the 5,000 review threshold - large amounts get a human look before booking.",
    },
    {
        "file": "invoice-06-poor-scan",
        "vendor": "Rowan Catering Co",
        "vendor_addr": ["3 Mill Court", "Ashford, OH 44410", "(330) 555-0455"],
        "bill_to": ["Brightside Dental Practice", "14 Weaver Street"],
        "number": "RC-0912",
        "date": "2026-09-05",
        "due": None,
        "items": [
            ("Staff training day catering", 2, 340.00),
            ("Delivery and setup", 1, 95.00),
        ],
        "stated_subtotal": None,
        "style": "scan",
        "expect": "needs_review",
        "why": "Photographed at an angle with poor contrast and the total partly clipped - Claude should say it is unsure rather than guess.",
    },
]


def compute(inv):
    """Work out the real numbers, and what the document will claim."""
    real_sum = round(sum(q * p for _, q, p in inv["items"]), 2)
    subtotal = inv["stated_subtotal"] if inv["stated_subtotal"] is not None else real_sum
    # The till receipt shows no tax breakdown at all, so its total is just the
    # sum of the items. That keeps it failing ONLY the missing-field check -
    # each test document should isolate one rule.
    if inv.get("style") == "receipt":
        return real_sum, subtotal, 0.0, subtotal
    tax = round(subtotal * TAX_RATE, 2)
    total = round(subtotal + tax, 2)
    return real_sum, subtotal, tax, total


# --------------------------------------------------------------------------
# PDF rendering
# --------------------------------------------------------------------------

def draw_invoice_pdf(inv, path):
    real_sum, subtotal, tax, total = compute(inv)
    c = canvas.Canvas(path, pagesize=A4)
    y = PAGE_H - 25 * mm

    # Vendor block
    c.setFont("Helvetica-Bold", 16)
    c.drawString(20 * mm, y, inv["vendor"] or "")
    y -= 6 * mm
    c.setFont("Helvetica", 9)
    for line in inv["vendor_addr"]:
        c.drawString(20 * mm, y, line)
        y -= 4.5 * mm

    # Title + meta
    c.setFont("Helvetica-Bold", 22)
    c.drawRightString(PAGE_W - 20 * mm, PAGE_H - 25 * mm, "INVOICE")
    c.setFont("Helvetica", 9)
    my = PAGE_H - 34 * mm
    for label, val in (
        ("Invoice No.", inv["number"]),
        ("Invoice Date", inv["date"]),
        ("Due Date", inv["due"]),
    ):
        if val:
            c.drawRightString(PAGE_W - 45 * mm, my, label + ":")
            c.drawRightString(PAGE_W - 20 * mm, my, val)
            my -= 5 * mm

    # Bill to
    y = min(y, my) - 8 * mm
    if inv["bill_to"]:
        c.setFont("Helvetica-Bold", 9)
        c.drawString(20 * mm, y, "BILL TO")
        y -= 5 * mm
        c.setFont("Helvetica", 9)
        for line in inv["bill_to"]:
            c.drawString(20 * mm, y, line)
            y -= 4.5 * mm

    # Line item table
    y -= 8 * mm
    c.setFillGray(0.92)
    c.rect(20 * mm, y - 2 * mm, PAGE_W - 40 * mm, 7 * mm, stroke=0, fill=1)
    c.setFillGray(0)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(22 * mm, y, "Description")
    c.drawRightString(PAGE_W - 78 * mm, y, "Qty")
    c.drawRightString(PAGE_W - 50 * mm, y, "Unit Price")
    c.drawRightString(PAGE_W - 22 * mm, y, "Amount")
    y -= 8 * mm

    c.setFont("Helvetica", 9)
    for desc, qty, price in inv["items"]:
        c.drawString(22 * mm, y, desc)
        c.drawRightString(PAGE_W - 78 * mm, y, str(qty))
        c.drawRightString(PAGE_W - 50 * mm, y, money(price))
        c.drawRightString(PAGE_W - 22 * mm, y, money(qty * price))
        y -= 6 * mm

    # Totals
    y -= 4 * mm
    c.line(PAGE_W - 90 * mm, y, PAGE_W - 20 * mm, y)
    y -= 6 * mm
    for label, val, bold in (
        ("Subtotal", subtotal, False),
        (f"Sales Tax ({TAX_RATE * 100:.1f}%)", tax, False),
        ("TOTAL DUE", total, True),
    ):
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 10 if bold else 9)
        c.drawRightString(PAGE_W - 50 * mm, y, label)
        c.drawRightString(PAGE_W - 22 * mm, y, f"${money(val)}")
        y -= 6 * mm

    c.setFont("Helvetica", 8)
    c.setFillGray(0.4)
    c.drawString(20 * mm, 20 * mm, f"Payment due within 30 days. All amounts in {CURRENCY}.")
    c.save()


def draw_receipt_pdf(inv, path):
    """A scruffy thermal-style receipt: no vendor name, no date."""
    real_sum, subtotal, tax, total = compute(inv)
    width, height = 80 * mm, 150 * mm
    c = canvas.Canvas(path, pagesize=(width, height))
    y = height - 12 * mm

    c.setFont("Courier-Bold", 11)
    c.drawCentredString(width / 2, y, "*** RECEIPT ***")
    y -= 7 * mm
    c.setFont("Courier", 8)
    for line in inv["vendor_addr"]:
        c.drawCentredString(width / 2, y, line)
        y -= 4.5 * mm

    y -= 4 * mm
    c.drawString(6 * mm, y, "-" * 34)
    y -= 5 * mm
    for desc, qty, price in inv["items"]:
        c.drawString(6 * mm, y, desc[:20])
        c.drawRightString(width - 6 * mm, y, money(qty * price))
        y -= 5 * mm
    c.drawString(6 * mm, y, "-" * 34)
    y -= 6 * mm

    c.setFont("Courier-Bold", 10)
    c.drawString(6 * mm, y, "TOTAL")
    c.drawRightString(width - 6 * mm, y, f"${money(total)}")
    y -= 8 * mm
    c.setFont("Courier", 8)
    c.drawCentredString(width / 2, y, "CARD **** 4417   APPROVED")
    y -= 5 * mm
    c.drawCentredString(width / 2, y, "NO REFUNDS WITHOUT RECEIPT")
    c.save()


# --------------------------------------------------------------------------
# Degraded scan (PNG)
# --------------------------------------------------------------------------

def _font(size, bold=False):
    for name in (("arialbd.ttf", "arial.ttf") if bold else ("arial.ttf",)):
        try:
            return ImageFont.truetype("C:/Windows/Fonts/" + name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_scan_png(inv, path):
    """Render the invoice as an image, then make it look badly photographed."""
    real_sum, subtotal, tax, total = compute(inv)
    # Page is cropped close to the content on purpose - a photo of a document
    # held in the hand, not a full-bleed scan. Dead whitespace would mean the
    # corner clip below removes nothing.
    W, H = 1240, 860
    img = Image.new("RGB", (W, H), (252, 251, 247))
    d = ImageDraw.Draw(img)

    d.text((70, 70), inv["vendor"], font=_font(44, bold=True), fill=(30, 30, 30))
    y = 130
    for line in inv["vendor_addr"]:
        d.text((70, y), line, font=_font(24), fill=(60, 60, 60))
        y += 32

    d.text((W - 300, 70), "INVOICE", font=_font(52, bold=True), fill=(30, 30, 30))
    d.text((W - 300, 140), f"No. {inv['number']}", font=_font(24), fill=(60, 60, 60))
    d.text((W - 300, 175), f"Date: {inv['date']}", font=_font(24), fill=(60, 60, 60))

    y += 60
    d.text((70, y), "BILL TO", font=_font(24, bold=True), fill=(30, 30, 30))
    y += 34
    for line in inv["bill_to"]:
        d.text((70, y), line, font=_font(24), fill=(60, 60, 60))
        y += 32

    y += 50
    d.rectangle([70, y - 8, W - 70, y + 40], fill=(232, 232, 228))
    d.text((84, y), "Description", font=_font(24, bold=True), fill=(30, 30, 30))
    d.text((W - 420, y), "Qty", font=_font(24, bold=True), fill=(30, 30, 30))
    d.text((W - 320, y), "Unit", font=_font(24, bold=True), fill=(30, 30, 30))
    d.text((W - 190, y), "Amount", font=_font(24, bold=True), fill=(30, 30, 30))
    y += 58

    for desc, qty, price in inv["items"]:
        d.text((84, y), desc, font=_font(24), fill=(45, 45, 45))
        d.text((W - 420, y), str(qty), font=_font(24), fill=(45, 45, 45))
        d.text((W - 320, y), money(price), font=_font(24), fill=(45, 45, 45))
        d.text((W - 190, y), money(qty * price), font=_font(24), fill=(45, 45, 45))
        y += 42

    y += 30
    d.line([W - 560, y, W - 70, y], fill=(120, 120, 120), width=2)
    y += 22
    for label, val, bold in (
        ("Subtotal", subtotal, False),
        (f"Sales Tax ({TAX_RATE * 100:.1f}%)", tax, False),
        ("TOTAL DUE", total, True),
    ):
        f = _font(28 if bold else 24, bold=bold)
        d.text((W - 470, y), label, font=f, fill=(30, 30, 30))
        d.text((W - 190, y), f"${money(val)}", font=f, fill=(30, 30, 30))
        y += 40

    # --- degrade -----------------------------------------------------------
    img = img.rotate(-4.6, expand=True, fillcolor=(236, 233, 226), resample=Image.BICUBIC)

    arr = np.asarray(img).astype(np.float32)
    gy, gx = np.mgrid[0:arr.shape[0], 0:arr.shape[1]]
    ny, nx = gy / arr.shape[0], gx / arr.shape[1]

    # Harsh uneven lighting: bright hotspot upper-left falling into shadow on
    # the right, plus a soft shadow band across the lower third.
    shade = 1.06 - 0.52 * nx - 0.18 * ny
    shade -= 0.14 * np.exp(-((ny - 0.72) ** 2) / 0.012)
    arr *= shade[:, :, None]

    arr += np.random.normal(0, 13.0, arr.shape)      # sensor grain
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))

    img = ImageEnhance.Contrast(img).enhance(0.42)
    img = img.filter(ImageFilter.GaussianBlur(radius=2.0))

    # The right edge of the page falls outside the frame, clipping the amount
    # column mid-figure - so the total is genuinely ambiguous, not just faint.
    w, h = img.size
    img = img.crop((0, 0, int(w * 0.883), int(h * 0.97)))

    # Downscale hard: this is what destroys the fine stroke detail that makes
    # digits legible, the way a low-res phone photo does.
    img = img.resize((int(img.width * 0.52), int(img.height * 0.52)), Image.LANCZOS)

    img.save(path, "PNG", optimize=True)
    return img


def wrap_image_as_pdf(img, path):
    """
    Drop the degraded image onto a PDF page.

    n8n's Anthropic node sends PDFs and images through two different
    operations, so keeping every test document a PDF avoids forking the
    workflow on file type for the sake of one file. The page carries no text
    layer - it is a picture of a document - so this still tests vision and the
    uncertainty path honestly.
    """
    w_pt = 190 * mm
    h_pt = w_pt * img.height / img.width
    c = canvas.Canvas(path, pagesize=(w_pt, h_pt))
    c.drawImage(ImageReader(img), 0, 0, width=w_pt, height=h_pt)
    c.save()


# --------------------------------------------------------------------------

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    manifest = []

    for inv in INVOICES:
        style = inv.get("style")
        filename = f"{inv['file']}.pdf"
        path = os.path.join(OUT_DIR, filename)

        if style == "scan":
            # The PNG is kept alongside as a reference image;
            # the PDF is what the workflow actually receives.
            png_path = os.path.join(OUT_DIR, f"{inv['file']}.png")
            degraded = draw_scan_png(inv, png_path)
            wrap_image_as_pdf(degraded, path)
        elif style == "receipt":
            draw_receipt_pdf(inv, path)
        else:
            draw_invoice_pdf(inv, path)

        real_sum, subtotal, tax, total = compute(inv)
        manifest.append({
            "file": filename,
            "vendor_name": inv["vendor"],
            "invoice_number": inv["number"],
            "invoice_date": inv["date"],
            "line_items_sum": real_sum,
            "stated_subtotal": subtotal,
            "tax_amount": tax,
            "total_amount": total,
            "expected_status": inv["expect"],
            "why": inv["why"],
        })
        print(f"  {filename:34s} total ${money(total):>10s}  -> {inv['expect']}")

    with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)

    print(f"\nWrote {len(manifest)} documents + manifest.json to {OUT_DIR}")


if __name__ == "__main__":
    main()
