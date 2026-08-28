# Quản lý công nợ NPP Hà Hoà

Bản Next.js + Supabase thay cho `CongnotongkhoHaHoa.html`. Ứng dụng gồm đăng nhập Supabase Auth, dashboard, bộ lọc, cảnh báo quá hạn, CRUD khoản nợ/thanh toán/hàng thu hồi, hạn mức nợ và xuất CSV.

## Trợ lý AI và dữ liệu JSON

- Nút `Hỏi AI` mở khung chat truy vấn công nợ trực tiếp từ Supabase.
- AI dùng Responses API + function tool để chỉ lấy dữ liệu phù hợp với tên khách hàng, Công, khoảng ngày và trạng thái; không gửi toàn bộ database ở mỗi câu hỏi.
- Nút `Tải JSON` xuất file thật gồm các trường `KH`, `Công`, `Tổng công nợ`, `Ngày nợ`, `Ngày trả`. Endpoint `/api/debts/json` bắt buộc Supabase access token.
- File [examples/cong-no-mau.json](examples/cong-no-mau.json) là dữ liệu giả để kiểm tra cấu trúc, không chứa dữ liệu khách hàng thật.

Đặt các biến server sau trong `.env.local` và Vercel:

```env
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
OPENAI_MODEL=gpt-5.4-mini
```

Không đặt khóa OpenAI với tiền tố `NEXT_PUBLIC_`. Cơ chế đăng nhập ChatGPT/Codex trong repo trạm cân dùng endpoint ChatGPT nội bộ, không phải API production công khai, nên không được sao chép vào website khách hàng.

## Chạy local với Supabase

Yêu cầu: Node.js 20+, Docker Desktop và Python 3 có `openpyxl` nếu cần nhập Excel.

```powershell
npm install
npm run db:start
```

Lệnh `db:start` in ra URL, anon key và service-role key. Tạo `.env.local` từ `.env.example`, điền các giá trị đó rồi chạy:

```powershell
pip install -r requirements-import.txt
npm run db:reset
npm run db:import -- "Công nợ theo từng nv tháng 4.xlsx"
npm run dev
```

Mở `http://localhost:3000` và đăng nhập bằng `IMPORT_ADMIN_EMAIL` / `IMPORT_ADMIN_PASSWORD` trong `.env.local`.

## Dùng Supabase Cloud

1. Tạo project trên Supabase.
2. Điền URL, anon key và service-role key vào `.env.local`.
3. Liên kết project và đẩy migration:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npm run db:push
npm run db:import -- "Công nợ theo từng nv tháng 4.xlsx"
```

Chỉ dùng `SUPABASE_SERVICE_ROLE_KEY` ở máy quản trị để import. Không đặt biến này trong biến môi trường public hoặc mã frontend.

## Cấu trúc dữ liệu

- `customers`: hồ sơ khách hàng chuẩn hoá theo tên.
- `debts`: khoản nợ, kỳ hạn, nhân viên phụ trách và nguồn Excel.
- `payments`: thanh toán gắn trực tiếp với một khoản nợ.
- `returns`: hàng thu hồi, có thể gắn với khoản nợ cụ thể.
- `debt_overview`: view tính số đã trả, giá trị thu hồi, dư nợ và trạng thái.
- `organization_settings`: hạn mức nợ và danh sách kỳ hạn.

Migration nằm tại `supabase/migrations/202608270001_initial_schema.sql`. Tất cả bảng nghiệp vụ bật RLS và chỉ tài khoản đã đăng nhập mới truy cập được.

## Quy tắc import workbook

`scripts/parse_workbook.py` tự nhận diện tiêu đề cột giữa các sheet, giữ `source_sheet/source_row` để truy vết và tạo UUID ổn định để chạy lại không bị nhân đôi. Với workbook hiện tại:

- 20/23 sheet có dữ liệu nghiệp vụ.
- 702 khách hàng, 1.514 khoản nợ, 641 thanh toán.
- 3 sheet tổng hợp/biểu đồ/rỗng được bỏ qua.
- 9 khoản nợ thiếu ngày và 62 thanh toán thiếu ngày được gắn ngày tạm; thanh toán thiếu ngày có ghi chú đánh dấu để đối soát.

Mật khẩu dạng rõ và endpoint Google Apps Script trong HTML cũ không được chuyển sang hệ thống mới. Tài khoản dùng Supabase Auth.

## Kiểm tra

```powershell
npm run lint
npm run build
python scripts/parse_workbook.py "Công nợ theo từng nv tháng 4.xlsx" --stats
```
