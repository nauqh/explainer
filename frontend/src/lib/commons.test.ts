import { describe, expect, it } from "vitest";
import { cleanTitle, pick } from "./commons";

const page = (index: number, title: string, mime = "image/png", artist = "<a href='x'>Ada</a>") => ({
  index, title,
  imageinfo: [{
    mime, thumburl: `https://upload.example/${index}.png`, thumbwidth: 960, thumbheight: 540,
    descriptionurl: `https://commons.wikimedia.org/wiki/${title}`,
    extmetadata: { LicenseShortName: { value: "CC BY 4.0" }, Artist: { value: artist } },
  }],
});

describe("pick", () => {
  it("takes the best-ranked diagram whose title names the concept, with its credit", () => {
    const img = pick([page(2, "File:Encoder self-attention, block diagram.png"), page(1, "File:Streaks on Mars.png")], "attention");
    expect(img).toMatchObject({ title: "Encoder self-attention, block diagram", license: "CC BY 4.0", artist: "Ada" });
  });

  it("refuses photos and off-topic hits, and returns nothing rather than a wrong picture", () => {
    expect(pick([page(1, "File:Attention (song) cover.jpg", "image/jpeg"), page(2, "File:Streaks on Mars.png")], "attention")).toBeNull();
  });

  it("needs every word of a multi-word concept", () => {
    const pages = [page(1, "File:Gradient vector field.svg", "image/svg+xml"), page(2, "File:Gradient descent with momentum.svg", "image/svg+xml")];
    expect(pick(pages, "gradient-descent")?.title).toBe("Gradient descent with momentum");
  });
});

describe("cleanTitle", () => {
  it("drops the namespace and extension", () => {
    expect(cleanTitle("File:RAG_diagram.svg")).toBe("RAG diagram");
  });
});
