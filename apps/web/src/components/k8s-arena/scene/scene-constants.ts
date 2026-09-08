/**
 * Hằng số dùng chung của cảnh. Không `three`, không DOM — chỉ số.
 *
 * Ở một chỗ vì phần lớn chúng phải KHỚP NHAU giữa hai file trở lên: lớp hào
 * quang phải khớp giữa bên đặt và bên bật trên camera, sức chứa instance phải
 * khớp giữa bên ghi và bên bắn tia. Hai bản sao của cùng một con số là cách
 * nhanh nhất để một trong hai trôi đi trong im lặng.
 */

/**
 * Lớp riêng cho hào quang và viền chọn.
 *
 * Chúng là ÁNH SÁNG, không phải vật thể — nên chúng phải vô hình với camera đổ
 * bóng và camera của bóng tiếp xúc, nếu không một quầng sáng rộng 1.3 lần sẽ đổ
 * xuống sàn thành một cái bóng to gấp rưỡi vật thật.
 */
export const LAYER_GLOW = 2;

/** Số instance cấp phát sẵn. Vượt thì nhân đôi, và KHÔNG BAO GIỜ thu lại. */
export const INITIAL_CAPACITY = 256;
/** Số bệ node cấp phát sẵn. Cụm trong bài học không bao giờ tới mức này. */
export const PLATFORM_CAPACITY = 32;

/**
 * Nhãn tối đa hiện cùng lúc.
 *
 * Trần này KHÔNG phải để tiết kiệm: nó là giới hạn đọc được. Quá vài chục nhãn
 * thì bước giãn nhãn hết chỗ trống và bắt đầu ẩn hàng loạt, mà một màn hình phủ
 * kín chữ cũng không ai đọc.
 */
export const MAX_LABELS = 28;
/** Nửa chiều cao hộp bao nhãn, pixel. Khớp với `text-[10px]` + padding dọc. */
export const LABEL_HALF_HEIGHT = 9;
/** Bề rộng ước lượng mỗi ký tự ở `text-[10px]` font mono, pixel. */
export const LABEL_CHAR_WIDTH = 5.4;
export const LABEL_NUDGE_STEP = 15;
export const LABEL_MAX_NUDGES = 4;

/**
 * Nhịp bắn tia tối đa, mili-giây (~30 lần/giây).
 *
 * Bản của k8sgames.com bắn tia MỖI KHUNG HÌNH không tiết chế, kể cả khi con trỏ
 * đứng yên. Ở đây tia chỉ bắn khi con trỏ THẬT SỰ di chuyển, và không quá nhịp
 * này — 30 lần/giây đã vượt xa ngưỡng người nhận ra được độ trễ khi rê chuột.
 */
export const PICK_INTERVAL_MS = 33;
/** Rê quá ngần này pixel giữa nhấn và nhả thì đó là thao tác xoay camera, không phải một cú bấm. */
export const CLICK_SLOP_PX = 5;

/**
 * Hộp bấm rộng hơn vật bao nhiêu lần (`hit-proxy.tsx`).
 *
 * SÀN là 1.0 — nhỏ hơn thì có phần vật nhìn thấy mà bấm không trúng, đúng lỗi
 * hộp này sinh ra để sửa. TRẦN là khoảng cách giữa hai vật gần nhau nhất: pod
 * trên cùng một bệ cách nhau ít nhất `POD_SIZE + POD_GAP_MIN` = 0.76 trong khi
 * cạnh hộp là `POD_SIZE × hệ số`; ở 1.12 ra 0.672, vẫn còn khe 0.088 nên không
 * pod nào ăn cắp cú bấm của pod bên cạnh.
 */
export const HIT_PADDING = 1.12;

/**
 * Kéo quá ngần này pixel kể từ lúc nhấn thì bắt đầu KÉO VẬT.
 *
 * Cao hơn `CLICK_SLOP_PX` một chút là có chủ ý: ngưỡng thấp hơn sẽ biến mọi cú
 * bấm hơi rung tay thành một cú kéo, và người chơi vô tình xê dịch cả cụm chỉ
 * vì muốn chọn một pod.
 */
export const DRAG_START_PX = 7;

/** Hệ số phóng của quầng sáng quanh vật. */
export const GLOW_SCALE = 1.34;
/** Hệ số phóng của vỏ viền vật đang chọn / đang rê. */
export const SELECT_SHELL_SCALE = 1.16;
export const HOVER_SHELL_SCALE = 1.1;
