import 'dotenv/config';

import multer from 'multer';
import { UploadApiResponse, v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

import router from './products';
import { query } from '../db';
import { requireAdminAPI } from '../middleware/requireAdmin';

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME as string,
    api_key: process.env.CLOUDINARY_API_KEY as string,
    api_secret: process.env.CLOUDINARY_API_SECRET as string
});

const storage = multer.memoryStorage();

const upload = multer({ storage: storage });

router.post('/upload', requireAdminAPI, upload.single('image'), async (req, res) => {
    // console.log("Incoming file from frontend:", req.file);
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded.'});
        }

        // Wrap the stream upload in a Promise
        const streamUpload = (buffer: Buffer): Promise<UploadApiResponse> => {
            return new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { folder: 'products' },
                    (error, result) => {
                        if (result) {
                            resolve(result);
                        } else {
                            reject(error);
                        }
                    }
                );

                // Convert the Multer buffer into a Node stream and pipe it to Cloudinary
                Readable.from(buffer).pipe(stream);
            });
        };

        // Await the stream upload
        const result = await streamUpload(req.file.buffer);

        // Send the secure URL back to Next.js
        res.json({ success: true, url: result.secure_url })
        
        // const b64 = Buffer.from(req.file.buffer).toString("base64");

        // let dataURI = "data:" + req.file.mimetype + ";base64," + b64;

        // // Await the custom promise
        // const cloudinaryResult = await cloudinary.uploader.upload(dataURI, {
        //     folder: 'products'
        // });

        // const imageUrl = cloudinaryResult.secure_url;

        // const productId = parseInt(req.body.productId, 10);

        // if (isNaN(productId)) {
        //     return res.status(400).json({ message: "Invalid product ID format"})
        // }

        // // Save the secure URL to PostgreSQL product table
        // await query('UPDATE products SET image_url = $1 WHERE id = $2', [imageUrl, productId]);

        // res.json({ success: true, url:imageUrl });
    } catch (error) {
        res.status(500).json({ error: 'Upload failed.' });
    }
});

export default router;