"""Inspection contract tests, not a substitute for real Poppler/visual QA."""
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from xml.sax.saxutils import escape

spec = importlib.util.spec_from_file_location("inspect_pdf", Path(__file__).with_name("inspect-pdf.py"))
inspector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inspector)


def bbox(lines):
    return '<html><doc><page width="595.304" height="841.89">' + ''.join(
        '<line xMin="{}" yMin="{}" xMax="{}" yMax="{}"><word>{}</word></line>'.format(*line[:4], escape(line[4]))
        for line in lines) + '</page></doc></html>'


class InspectPdfContract(unittest.TestCase):
    def run_inspection(self, pages=1, rotation=0, text=""):
        metadata = f"Pages: {pages}\nPage 1 size: 595.304 x 841.89 pts (A4)\nPage 1 rot: {rotation}\n"
        calls = []

        def output(command, limit):
            calls.append((command, limit))
            return metadata if command[0] == "/usr/bin/pdfinfo" else bbox([(40, 40, 500, 60, text)])

        destination = io.BytesIO()
        with patch.object(inspector.os.path, "getsize", return_value=1000), \
                patch.object(inspector, "bounded_output", side_effect=output), \
                patch.object(inspector.sys, "stdout") as stdout:
            stdout.buffer = destination
            inspector.inspect()
        return json.loads(destination.getvalue()), calls

    def test_bounding_boxes_not_physical_rows_or_raw_stream(self):
        # The real two-column fixture's physical row extraction inserted
        # "Excel SQL Python" between "个人" and "独立成果" in this sentence.
        text = "Excel SQL Python\n参与团队讨论，解释清洗步骤与检查范围，不将团队成果归为个人\n独立成果。"
        result, calls = self.run_inspection(text=text)
        self.assertEqual(calls[1], (["/usr/bin/pdftotext", "-enc", "UTF-8", "-bbox-layout", "/work/resume.pdf", "-"], inspector.MAX_BBOX_BYTES))
        self.assertEqual(result["text"], text)  # No repair, reordering or deletion in Python.
        self.assertEqual(result["pageCount"], 1)

    def test_multi_page_does_not_extract_text(self):
        result, calls = self.run_inspection(pages=2)
        self.assertEqual(len(calls), 1)
        self.assertEqual(result["pageCount"], 2)
        self.assertEqual(result["text"], "")

    def test_rotated_page_still_fails_size_contract(self):
        result, _ = self.run_inspection(rotation=90)
        self.assertEqual(result["pages"], [{"width": 0, "height": 0}])

    def test_large_pdf_is_rejected_before_subprocess(self):
        with patch.object(inspector.os.path, "getsize", return_value=20 * 1024 * 1024 + 1), \
                patch.object(inspector, "bounded_output") as output:
            with self.assertRaises(ValueError):
                inspector.inspect()
            output.assert_not_called()

    def test_real_fixture_coordinates_keep_wrapped_sentence_in_its_column(self):
        # Coordinates and synthetic text observed in the real LibreOffice QA
        # output. Poppler's default order put the left tools between these two
        # right-column lines. The full-width title prevents a whole-page X cut.
        lines = [
            (51.1, 115.050764, 348.3, 129.530764, "qa-resume@example.invalid | 示例城市 | 本文件仅用于软件验收"),
            (51.7, 179.030764, 99.7, 196.406764, "教育经历"),
            (213.25, 179.030764, 261.25, 196.406764, "实习经历"),
            (213.25, 249.190764, 532.25, 265.118764, "协助整理公开数据，核对日期格式并记录缺失字段，完成可复查的"),
            (51.7, 280.030764, 111.7, 297.406764, "工具与语言"),
            (51.7, 304.490764, 140.91, 320.418764, "Excel SQL Python"),
            (213.25, 267.040764, 268.25, 282.968764, "字段说明。"),
            (51.7, 203.490764, 164.153, 219.418764, "示例大学 商业分析本科"),
            (213.25, 203.490764, 358.703, 219.418764, "示例研究团队 数据整理实习生"),
        ]
        result = inspector.bbox_text(bbox(lines), 595.304, 841.89)
        expected = [lines[index][4] for index in [0, 1, 7, 4, 5, 2, 8, 3, 6]]
        self.assertEqual(result, "\n".join(expected))
        self.assertEqual(sorted(result.replace("\n", "")), sorted("".join(line[4] for line in lines)))

    def test_preserves_repeated_words_and_decodes_xml_once(self):
        result = inspector.bbox_text(bbox([(40, 40, 180, 60, "A & B < C"), (40, 65, 180, 85, "A & B < C")]), 595.304, 841.89)
        self.assertEqual(result, "A & B < C\nA & B < C")

    def test_out_of_bounds_nan_and_degenerate_coordinates_fail_closed(self):
        for coordinates in [(40, 40, 600, 60), (40, 40, 20, 60), (float("nan"), 40, 80, 60)]:
            with self.subTest(coordinates=coordinates), self.assertRaises(ValueError):
                inspector.bbox_text(bbox([(*coordinates, "text")]), 595.304, 841.89)

    def test_no_words_can_be_silently_discarded(self):
        xml = bbox([(40, 40, 100, 60, "original")]).replace("</page>", "<word>extra</word></page>")
        with self.assertRaises(ValueError):
            inspector.bbox_text(xml, 595.304, 841.89)

    def test_rejects_entity_declarations_and_accepts_only_passive_poppler_doctype(self):
        xml = bbox([(40, 40, 100, 60, "text")])
        self.assertEqual(inspector.bbox_text('<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">' + xml, 595.304, 841.89), "text")
        with self.assertRaises(ValueError):
            inspector.bbox_text('<!DOCTYPE html [<!ENTITY x "expanded">]>' + xml, 595.304, 841.89)

    def test_bounds_the_number_of_lines(self):
        with self.assertRaises(ValueError):
            inspector.bbox_text(bbox([(40, 40, 100, 60, "text")] * 2001), 595.304, 841.89)


if __name__ == "__main__":
    unittest.main()
