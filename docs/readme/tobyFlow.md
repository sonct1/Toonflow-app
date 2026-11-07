# TobyFlow: tạo ảnh Dreamina

Toonflow tích hợp TobyFlow qua provider **TobyFlow (Dreamina images)**. Bản đầu chỉ hỗ trợ text-to-image: `Seedream 4.6` và `GPT Image 2`. Không hỗ trợ video, ảnh tham chiếu, mask hoặc chỉnh sửa ảnh.

## Chuẩn bị

1. Chạy `adapter-bridge` và Chrome extension `offline-runtime` theo hướng dẫn của [TobyFlow](https://github.com/sonct1/TobyFlow). Đăng nhập Dreamina trong Chrome; tài khoản phải còn quota.
2. Giữ Chrome, extension và bridge hoạt động trong suốt tác vụ. Đây là tự động hóa website, không phải API tạo ảnh độc lập.
3. Bridge mặc định không có authentication và lắng nghe trên `0.0.0.0:8765`. Giới hạn bằng firewall cho máy local và mạng Docker cần thiết; không public cổng này ra Internet.

## Cấu hình Toonflow

Trong Settings → Media models → thêm provider tích hợp sẵn, chọn **TobyFlow (Dreamina images)**, sau đó lưu:

- **TobyFlow bridge URL**: `http://host.docker.internal:8765` nếu Toonflow chạy bằng Compose trên cùng máy với bridge. Compose đã có mapping `host-gateway` cho Linux. Nếu server chạy trực tiếp, dùng `http://127.0.0.1:8765`.
- **Existing Dreamina session**: để trống để tạo session mới; chỉ điền session ID của TobyFlow khi muốn dùng lại session đó. Không phải cookie hay khóa đăng nhập.
- Không cần API key. Không ghi cookie Chrome vào cấu hình Toonflow.

Tại node tạo ảnh, chọn một trong hai model Dreamina, nhập prompt, tỷ lệ và kích thước. UI hiện tại gửi một ảnh mỗi tác vụ. `GPT Image 2` mặc định quality `low`; bản đầu chưa thêm tùy chọn quality vào node.

**Kích thước là độ phân giải yêu cầu tạo, không đảm bảo kích thước file tải về.** Adapter tải `preview`; ảnh có thể chỉ 720px. Không dùng đường tải original thử nghiệm. Giới hạn bridge: 16 MiB/file. Provider luôn thay thế prompt có sẵn trong ô soạn thảo Dreamina do tác vụ sử dụng (`replaceDraft: true`). Không xóa ảnh/video đính kèm; nội dung tham chiếu vẫn bị từ chối.

## Tác vụ gián đoạn

Provider lưu checkpoint trước POST và lưu ID ngay khi nhận phản hồi. Sau khi có ID, Resume chỉ GET trạng thái/tải kết quả, không POST tạo lại. Media tải bằng địa chỉ bridge đã cấu hình thay vì URL loopback trả về, nên dùng được từ container.

- `preparing` / `dispatching`: chờ tối đa 15 phút mỗi lượt; có thể Resume nếu hết thời gian.
- `completed`: tải từng ảnh rồi để Toonflow lưu vào workspace.
- `failed_preparation`: thất bại được xác nhận.
- `outcome_unknown`: kiểm tra/reconcile tác vụ trong TobyFlow, rồi Resume. Không tạo task mới vì lượt cũ có thể đã trừ quota.
- Mất phản hồi POST trước khi có ID: checkpoint giữ idempotency key, nhưng không tự gửi lại, kể cả Resume. Phải kiểm tra TobyFlow thủ công để xác định tác vụ đã được gửi hay chưa. Không tự khởi động lại/xóa storage extension để thử lại.
- Đổi địa chỉ bridge: khôi phục địa chỉ cũ trước khi Resume, tránh truy vấn nhầm runtime.

## Kiểm chứng

API đối chiếu với TobyFlow commit `272b867`. Kiểm tra type/build và nạp provider không chứng minh generation live. Cần kiểm chứng tạo/tải ảnh thật sau khi đã kết nối extension và đăng nhập Dreamina; thao tác đó có thể tiêu quota.

## Test trong Settings

Nút Test cũng lưu checkpoint trước khi gửi yêu cầu, tại `data/providerDebugTasks/<runId>.json` với quyền `0600`. Chỉ lưu dữ liệu phục hồi đã qua kiểm tra của host, không lưu source hoặc cấu hình credentials. Nếu lỗi sau checkpoint, giao diện báo vị trí file để kiểm tra thủ công.

Sau khi nhận run ID, Settings hiện nút **Resume / Download existing task**. Resume dùng checkpoint hiện có và không tạo generation mới. Nút **Bắt đầu kiểm thử** vẫn tạo generation mới; khi mất kết nối hoặc kết quả chưa rõ, ưu tiên Resume hoặc kiểm tra tác vụ TobyFlow theo checkpoint. Không có tự động replay hoặc tự động xóa checkpoint.
