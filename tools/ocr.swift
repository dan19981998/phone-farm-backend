import Foundation
import Vision
import AppKit

struct Box: Codable {
    let text: String
    let confidence: Float
    let x: Int
    let y: Int
    let w: Int
    let h: Int
}

struct Result: Codable {
    let width: Int
    let height: Int
    let boxes: [Box]
}

guard CommandLine.arguments.count > 1 else {
    FileHandle.standardError.write("usage: ocr <image>\n".data(using: .utf8)!)
    exit(2)
}

let path = CommandLine.arguments[1]
guard let image = NSImage(contentsOfFile: path),
      let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    FileHandle.standardError.write("cannot load image\n".data(using: .utf8)!)
    exit(1)
}

let w = CGFloat(cg.width)
let h = CGFloat(cg.height)

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false

let handler = VNImageRequestHandler(cgImage: cg, options: [:])
try handler.perform([request])

var boxes: [Box] = []
for obs in (request.results ?? []) {
    guard let top = obs.topCandidates(1).first else { continue }
    let bb = obs.boundingBox
    let px = bb.origin.x * w
    let py = (1 - bb.origin.y - bb.height) * h
    let pw = bb.width * w
    let ph = bb.height * h
    boxes.append(Box(text: top.string, confidence: top.confidence,
                     x: Int(px + pw / 2), y: Int(py + ph / 2),
                     w: Int(pw), h: Int(ph)))
}

let result = Result(width: Int(w), height: Int(h), boxes: boxes)
let out = try JSONEncoder().encode(result)
FileHandle.standardOutput.write(out)
