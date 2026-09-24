import jsPDF from "jspdf";
import { periodLabel } from "@/lib/od-rules";
import type { ODRecord } from "@/types/domain";

export function downloadConsolidatedPdf(records: ODRecord[], filters: { year?: string; section?: string; date?: string; academicYear?: string }, branding: { collegeName: string; departmentName: string }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 44;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("[Add official logo]", 48, y);
  doc.text(branding.collegeName.toUpperCase(), pageWidth / 2, y, { align: "center" });
  y += 22;
  doc.setFontSize(11);
  doc.text(branding.departmentName.toUpperCase(), pageWidth / 2, y, { align: "center" });
  y += 34;
  doc.setFontSize(15);
  doc.text("ON-DUTY LIST", pageWidth / 2, y, { align: "center" });
  y += 28;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Academic Year: ${filters.academicYear ?? "All"}`, 48, y);
  doc.text(`Class: ${filters.year ?? "All"} ECE-${filters.section ?? "All"}`, 250, y);
  y += 18;
  doc.text(`Date: ${filters.date ?? "Selected range"}`, 48, y);
  doc.text(`Total Students: ${records.length}`, 250, y);
  y += 28;

  const headers = ["S.No", "Register No", "Name", "Purpose", "Period", "Type"];
  const widths = [36, 78, 112, 116, 102, 58];
  doc.setFont("helvetica", "bold");
  let x = 48;
  headers.forEach((header, index) => {
    doc.text(header, x, y);
    x += widths[index];
  });
  y += 14;
  doc.line(48, y, pageWidth - 48, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  records.forEach((record, index) => {
    if (y > 730) {
      doc.addPage();
      y = 54;
    }
    const row = [
      String(index + 1),
      record.student.registerNumber ?? "-",
      record.student.name,
      record.category,
      periodLabel(record.periods),
      record.isSpecial ? "Special" : "Regular"
    ];
    x = 48;
    row.forEach((cell, cellIndex) => {
      doc.text(doc.splitTextToSize(cell, widths[cellIndex] - 8), x, y);
      x += widths[cellIndex];
    });
    y += 26;
  });

  y += 30;
  doc.text("Faculty Signature: __________________", 48, y);
  doc.text("HOD Signature: __________________", 320, y);
  doc.save("ece-consolidated-od-list.pdf");
}
