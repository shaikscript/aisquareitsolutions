<?php
/**
 * Minimal dependency-free PDF writer (PDF 1.4, Helvetica).
 * Used by the installer to create starter guideline documents.
 */

declare(strict_types=1);

const PDF_PAGE_W = 595.28;
const PDF_PAGE_H = 841.89;
const PDF_MARGIN = 56.0;
const PDF_BODY_SIZE = 10.5;

function pdf_escape(string $value): string
{
    $value = str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $value);
    return preg_replace('/[^\x20-\x7E]/', ' ', $value) ?? '';
}

function pdf_wrap(string $text, int $maxChars): array
{
    $words = preg_split('/\s+/', trim($text)) ?: [];
    $lines = [];
    $line = '';
    foreach ($words as $word) {
        if ($word === '') {
            continue;
        }
        if ($line === '') {
            $line = $word;
        } elseif (strlen($line . ' ' . $word) <= $maxChars) {
            $line .= ' ' . $word;
        } else {
            $lines[] = $line;
            $line = $word;
        }
    }
    if ($line !== '') {
        $lines[] = $line;
    }
    return $lines ?: [''];
}

function build_pdf(string $title, string $subtitle = '', array $sections = []): string
{
    $pages = [];
    $ops = [];
    $y = PDF_PAGE_H - PDF_MARGIN;

    $newPage = static function () use (&$pages, &$ops, &$y): void {
        if (count($ops)) {
            $pages[] = implode("\n", $ops);
        }
        $ops = [];
        $y = PDF_PAGE_H - PDF_MARGIN;
    };

    $writeLine = static function (string $text, float $size = PDF_BODY_SIZE, bool $bold = false, float $gap = 0, string $color = '0.13 0.13 0.15') use (&$ops, &$y, $newPage): void {
        if ($y < PDF_MARGIN + 40) {
            $newPage();
        }
        $ops[] = sprintf(
            'BT /%s %.2F Tf %s rg 1 0 0 1 %.2F %.2F Tm (%s) Tj ET',
            $bold ? 'F2' : 'F1',
            $size,
            $color,
            PDF_MARGIN,
            $y,
            pdf_escape($text)
        );
        $y -= $size * 1.42 + $gap;
    };

    $writeLine('AISQUARE IT SOLUTIONS', 9, true, 0, '0.45 0.35 0.85');
    $y -= 6;
    foreach (pdf_wrap($title, 62) as $line) {
        $writeLine($line, 20, true);
    }
    if ($subtitle !== '') {
        $y -= 2;
        foreach (pdf_wrap($subtitle, 92) as $line) {
            $writeLine($line, 10, false, 0, '0.42 0.42 0.48');
        }
    }
    $y -= 12;
    $ops[] = sprintf('%.2F %.2F m %.2F %.2F l S', PDF_MARGIN, $y, PDF_PAGE_W - PDF_MARGIN, $y);
    $y -= 22;

    foreach ($sections as $section) {
        if (!empty($section['heading'])) {
            $y -= 6;
            foreach (pdf_wrap((string) $section['heading'], 66) as $line) {
                $writeLine($line, 13, true);
            }
            $y -= 2;
        }
        foreach ($section['paragraphs'] ?? [] as $paragraph) {
            foreach (pdf_wrap((string) $paragraph, 98) as $line) {
                $writeLine($line);
            }
            $y -= 6;
        }
        foreach ($section['bullets'] ?? [] as $bullet) {
            $lines = pdf_wrap((string) $bullet, 94);
            foreach ($lines as $index => $line) {
                $writeLine(($index === 0 ? '-  ' : '   ') . $line);
            }
        }
        if (!empty($section['bullets'])) {
            $y -= 6;
        }
    }

    $writeLine('Document generated ' . gmdate('Y-m-d') . ' · Property of AI Square IT Solutions. Internal use only.', 8, false, 0, '0.55 0.55 0.6');
    if (count($ops)) {
        $pages[] = implode("\n", $ops);
    }
    if (count($pages) === 0) {
        $pages[] = '';
    }

    $objects = [];
    $add = static function (string $body) use (&$objects): int {
        $objects[] = $body;
        return count($objects);
    };

    $font1 = $add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    $font2 = $add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

    $contentIds = [];
    foreach ($pages as $content) {
        $contentIds[] = $add('<< /Length ' . strlen($content) . " >>\nstream\n" . $content . "\nendstream");
    }

    $pagesObjId = count($objects) + count($pages) + 1;
    $kids = [];
    foreach ($pages as $index => $ignored) {
        $pageId = $add(sprintf(
            '<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %.2F %.2F] /Resources << /Font << /F1 %d 0 R /F2 %d 0 R >> >> /Contents %d 0 R >>',
            $pagesObjId,
            PDF_PAGE_W,
            PDF_PAGE_H,
            $font1,
            $font2,
            $contentIds[$index]
        ));
        $kids[] = $pageId . ' 0 R';
    }

    $pagesId = $add('<< /Type /Pages /Kids [' . implode(' ', $kids) . '] /Count ' . count($pages) . ' >>');
    $catalogId = $add('<< /Type /Catalog /Pages ' . $pagesId . ' 0 R >>');

    $pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    $offsets = [];
    foreach ($objects as $index => $body) {
        $offsets[$index + 1] = strlen($pdf);
        $pdf .= ($index + 1) . " 0 obj\n" . $body . "\nendobj\n";
    }

    $xrefStart = strlen($pdf);
    $pdf .= "xref\n0 " . (count($objects) + 1) . "\n0000000000 65535 f \n";
    for ($i = 1; $i <= count($objects); $i++) {
        $pdf .= sprintf("%010d 00000 n \n", $offsets[$i]);
    }
    $pdf .= "trailer\n<< /Size " . (count($objects) + 1) . " /Root " . $catalogId . " 0 R >>\nstartxref\n" . $xrefStart . "\n%%EOF";

    return $pdf;
}
