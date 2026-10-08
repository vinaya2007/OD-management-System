import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildXlsx } from "@/lib/xlsx";

describe("XLSX export", () => {
  it("builds a readable OOXML workbook with headers and escaped report data", () => {
    const archive = buildXlsx([["OD Request ID", "Student Name"], ["OD-1001", "A & B"]]);
    expect(archive.readUInt32LE(0)).toBe(0x04034b50);
    const entries = new Map<string, string>();
    let offset = 0;
    while (archive.readUInt32LE(offset) === 0x04034b50) {
      const compressedSize = archive.readUInt32LE(offset + 18);
      const nameLength = archive.readUInt16LE(offset + 26);
      const extraLength = archive.readUInt16LE(offset + 28);
      const nameStart = offset + 30;
      const name = archive.toString("utf8", nameStart, nameStart + nameLength);
      const dataStart = nameStart + nameLength + extraLength;
      const compressed = archive.subarray(dataStart, dataStart + compressedSize);
      entries.set(name, inflateRawSync(compressed).toString("utf8"));
      offset = dataStart + compressedSize;
    }
    expect(entries.has("[Content_Types].xml")).toBe(true);
    expect(entries.get("xl/workbook.xml")).toContain("Consolidated OD");
    expect(entries.get("xl/worksheets/sheet1.xml")).toContain("OD Request ID");
    expect(entries.get("xl/worksheets/sheet1.xml")).toContain("A &amp; B");
  });
});
