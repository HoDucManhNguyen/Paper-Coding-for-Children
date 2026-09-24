import Foundation
import Vision
import ImageIO
import CoreImage

// One image on stdin, one JSON response on stdout. No image files or network calls.
struct Candidate: Codable { let text: String; let confidence: Float }
struct Observation: Codable { let box: [Double]; let candidates: [Candidate] }
struct Pass: Codable { let name: String; let observations: [Observation] }
struct Response: Codable { let engine: String; let passes: [Pass] }

func recognize(_ image: CGImage, name: String) throws -> Pass {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["en-US"]
    // Programming symbols are not prose. Do not apply spelling correction.
    request.usesLanguageCorrection = false
    request.minimumTextHeight = 0.005
    request.revision = VNRecognizeTextRequestRevision3
    try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
    return Pass(name: name, observations: (request.results ?? []).map { item in
        let b = item.boundingBox
        // Convert Vision's bottom-left coordinates to top-left for the browser.
        return Observation(box: [b.minX, 1 - b.maxY, b.width, b.height],
                           candidates: item.topCandidates(3).map { Candidate(text: $0.string, confidence: $0.confidence) })
    })
}

do {
    if CommandLine.arguments.contains("--version") {
        print("papercode-vision-1 revision-3")
        exit(0)
    }
    let data = FileHandle.standardInput.readDataToEndOfFile()
    guard !data.isEmpty, data.count <= 8 * 1024 * 1024,
          let source = CGImageSourceCreateWithData(data as CFData, nil) else {
        throw NSError(domain: "PaperCode", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid or oversized image"])
    }
    let options: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
                                   kCGImageSourceThumbnailMaxPixelSize: 2400,
                                   kCGImageSourceCreateThumbnailWithTransform: true]
    guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
        throw NSError(domain: "PaperCode", code: 2, userInfo: [NSLocalizedDescriptionKey: "Cannot decode image"])
    }
    var passes = [try recognize(image, name: "original")]
    let adjusted = CIImage(cgImage: image).applyingFilter("CIColorControls", parameters: [
        kCIInputSaturationKey: 0, kCIInputContrastKey: 2.0
    ])
    let context = CIContext(options: [.cacheIntermediates: false])
    if let contrast = context.createCGImage(adjusted, from: adjusted.extent) {
        passes.append(try recognize(contrast, name: "contrast"))
    }
    // A tilted camera page can yield no text. Retry bounded geometric rotations;
    // these transform image pixels, never the recognized characters.
    if passes.allSatisfy({ $0.observations.isEmpty }) {
        for degrees in [-30, 30, -15, 15] {
            let rotated = CIImage(cgImage: image).transformed(by: CGAffineTransform(rotationAngle: Double(degrees) * .pi / 180))
            let background = CIImage(color: CIColor.white).cropped(to: rotated.extent)
            let composited = rotated.composited(over: background)
            if let rotatedImage = context.createCGImage(composited, from: composited.extent) {
                passes.append(try recognize(rotatedImage, name: "rotate-\(degrees)"))
            }
        }
    }
    let output = try JSONEncoder().encode(Response(engine: "apple-vision", passes: passes))
    FileHandle.standardOutput.write(output)
} catch {
    let message = try? JSONSerialization.data(withJSONObject: ["error": error.localizedDescription])
    if let message { FileHandle.standardError.write(message) }
    exit(1)
}
