export interface Product {
    id?: number;
    sku: string;
    name: string;
    description: string | null;
    price: number;
    stock_quantity: number;
    created_at: Date;
}