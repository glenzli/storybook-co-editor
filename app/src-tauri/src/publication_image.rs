use base64::Engine;
use image::{GenericImageView, ImageFormat};

const MAX_SOURCE_BYTES: usize = 64 * 1024 * 1024;
const MAX_WEBP_DIMENSION: u32 = 16_383;
const WEBP_QUALITY: f32 = 90.0;

fn encode_failed() -> String {
    "PUBLICATION_WEBP_ENCODE_FAILED".to_string()
}

fn encode_png_bytes(png: &[u8]) -> Result<Vec<u8>, String> {
    if png.is_empty()
        || png.len() > MAX_SOURCE_BYTES
        || image::guess_format(png).ok() != Some(ImageFormat::Png)
    {
        return Err(encode_failed());
    }

    let image =
        image::load_from_memory_with_format(png, ImageFormat::Png).map_err(|_| encode_failed())?;
    let (width, height) = image.dimensions();
    if width == 0 || height == 0 || width > MAX_WEBP_DIMENSION || height > MAX_WEBP_DIMENSION {
        return Err(encode_failed());
    }

    let rgba = image.to_rgba8();
    let webp = webp::Encoder::from_rgba(rgba.as_raw(), width, height)
        .encode(WEBP_QUALITY)
        .to_vec();
    if webp.is_empty() || webp.len() > MAX_SOURCE_BYTES {
        return Err(encode_failed());
    }
    Ok(webp)
}

fn encode_base64_png(png_base64: &str) -> Result<String, String> {
    if png_base64.len() > (MAX_SOURCE_BYTES * 4 / 3) + 4 {
        return Err(encode_failed());
    }
    let png = base64::engine::general_purpose::STANDARD
        .decode(png_base64)
        .map_err(|_| encode_failed())?;
    let webp = encode_png_bytes(&png)?;
    Ok(base64::engine::general_purpose::STANDARD.encode(webp))
}

#[tauri::command]
pub async fn encode_publication_webp(png_base64: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || encode_base64_png(&png_base64))
        .await
        .map_err(|_| encode_failed())?
}

#[cfg(test)]
mod tests {
    use super::{encode_base64_png, encode_png_bytes};
    use base64::Engine;
    use image::{DynamicImage, GenericImageView, ImageFormat, Rgba, RgbaImage};
    use std::io::Cursor;

    fn test_png() -> Vec<u8> {
        let image = RgbaImage::from_pixel(2, 1, Rgba([12, 34, 56, 255]));
        let mut png = Vec::new();
        DynamicImage::ImageRgba8(image)
            .write_to(&mut Cursor::new(&mut png), ImageFormat::Png)
            .unwrap();
        png
    }

    #[test]
    fn encodes_png_as_webp() {
        let webp = encode_png_bytes(&test_png()).unwrap();
        assert_eq!(&webp[..4], b"RIFF");
        assert_eq!(&webp[8..12], b"WEBP");

        let decoded = image::load_from_memory_with_format(&webp, ImageFormat::WebP).unwrap();
        assert_eq!(decoded.dimensions(), (2, 1));
        let pixel = decoded.to_rgba8().get_pixel(0, 0).0;
        assert!(pixel[0].abs_diff(12) <= 4);
        assert!(pixel[1].abs_diff(34) <= 4);
        assert!(pixel[2].abs_diff(56) <= 4);
        assert_eq!(pixel[3], 255);
    }

    #[test]
    fn rejects_non_png_input() {
        let encoded = base64::engine::general_purpose::STANDARD.encode(b"not a png");
        assert_eq!(
            encode_base64_png(&encoded).unwrap_err(),
            "PUBLICATION_WEBP_ENCODE_FAILED"
        );
    }
}
