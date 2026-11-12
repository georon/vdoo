// The "Open an example" schema: a small shop with one-to-many, many-to-many (through order_item) and optional links.
export const EXAMPLE = `erDiagram
  customer {
    int id PK
    varchar(255) email UK "Used to sign in"
    varchar(100) name
    timestamp created_at
  }
  address {
    int id PK
    int customer_id FK
    varchar(200) street
    varchar(100) city
    char(2) country
  }
  orders {
    int id PK
    int customer_id FK
    int address_id FK
    timestamp placed_at
    decimal(10,2) total
  }
  product {
    int id PK
    varchar(64) sku UK
    varchar(200) title
    decimal(10,2) price
  }
  order_item {
    int orders_id PK, FK
    int product_id PK, FK
    int quantity
    decimal(10,2) unit_price
  }
  customer ||..o{ address : "lives at"
  customer ||..o{ orders : places
  address |o..o{ orders : "ships to"
  orders ||--|{ order_item : contains
  product ||--o{ order_item : "sold in"
`;
