package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// Bảng phân bổ chặng attach (1.G-4 M1).
//
// ⛔ PHÂN BỔ DÙNG TRUNG BÌNH, KHÔNG DÙNG p95 — và đây là điểm dễ sai nhất của
// cả phép đo. p95 của năm chặng KHÔNG cộng lại thành p95 của tổng: phân vị
// không cộng được, vì lượt attach nằm ở p95 của chặng `pty` không nhất thiết là
// lượt nằm ở p95 của tổng. Cái CÓ cộng được là tổng (`_sum`): với từng lượt
// attach, năm chặng cộng lại bằng đúng tổng của lượt đó, nên
// `Σ sum(phase) == sum(total)` là một ĐẲNG THỨC, không phải xấp xỉ.
//
// Vì thế: quy trách nhiệm bằng phần trăm của trung bình; p95 từng chặng chỉ in
// kèm để thấy chặng nào có đuôi dài.
var thuTuChang = []string{"wait_init", "build_exec", "upgrade", "streams", "pty"}

type changStat struct {
	count   int64
	sum     float64
	buckets []bucket
}

// deltaCount / deltaSum lấy phần TĂNG so với bản đọc trước, cùng lý lẽ với
// p95Delta: histogram cộng dồn từ lúc pod lên, nên không trừ là để lịch sử
// quyết định kết luận của hiện tại.
func (c changStat) deltaCount(truoc changStat) int64 { return c.count - truoc.count }
func (c changStat) deltaSum(truoc changStat) float64 { return c.sum - truoc.sum }

func (c changStat) p95Delta(truoc changStat) float64 {
	cu := map[float64]int64{}
	for _, b := range truoc.buckets {
		cu[b.le] = b.cum
	}
	tong := c.deltaCount(truoc)
	if tong <= 0 {
		return 0
	}
	nguong := int64(float64(tong) * 0.95)
	for _, b := range c.buckets {
		if b.cum-cu[b.le] >= nguong {
			return b.le
		}
	}
	if len(c.buckets) == 0 {
		return 0
	}
	return c.buckets[len(c.buckets)-1].le
}

// bangChang là một bản chụp mọi thứ cần cho bảng phân bổ tại một thời điểm.
type bangChang struct {
	chang      map[string]changStat
	tongSum    float64 // dlp_gateway_attach_duration_seconds_sum
	tongCount  int64   // dlp_gateway_attach_duration_seconds_count
	incomplete float64 // tổng mọi nhãn của dlp_gateway_attach_phase_incomplete_total

	// incompleteLyDo tách theo nhãn `reason`. In ra khi có lượt bị loại: hai lý
	// do đòi hai hành động khác nhau (missing_mark = đi sửa instrumentation;
	// out_of_order = ghi nhận rồi thôi), nên báo một con số gộp là bắt người
	// đọc đi điều tra lại thứ counter đã biết sẵn.
	incompleteLyDo map[string]float64

	// controlled là đại lượng ô AC gác (1.G-4 P4): tổng attach TRỪ `pty`.
	controlled changStat
}

var (
	// Nhãn `le` và `phase` có thể xuất hiện theo thứ tự nào tuỳ client_golang,
	// nên KHÔNG khớp cả khối nhãn bằng một mẫu cứng — bóc từng nhãn riêng. Một
	// regex đoán sai thứ tự sẽ trả 0 mẫu và trông y hệt "chặng đó chưa chạy".
	rePhaseLine = regexp.MustCompile(`^dlp_gateway_attach_phase_seconds_(bucket|sum|count)\{([^}]*)\}\s+([0-9.e+-]+)`)
	reNhan      = regexp.MustCompile(`(\w+)="([^"]*)"`)

	reTongSum   = regexp.MustCompile(`^dlp_gateway_attach_duration_seconds_sum\s+([0-9.e+-]+)`)
	reTongCount = regexp.MustCompile(`^dlp_gateway_attach_duration_seconds_count\s+([0-9.e+-]+)`)

	reCtlBucket = regexp.MustCompile(`^dlp_gateway_attach_controlled_seconds_bucket\{le="([^"]+)"\}\s+([0-9.e+-]+)`)
	reCtlCount  = regexp.MustCompile(`^dlp_gateway_attach_controlled_seconds_count\s+([0-9.e+-]+)`)
	reCtlSum    = regexp.MustCompile(`^dlp_gateway_attach_controlled_seconds_sum\s+([0-9.e+-]+)`)
	// Counter nay CO nhan `reason`, nen phai khop ca khoi nhan roi cong don —
	// mau khong nhan se khong khop dong nao va bao cao "0 luot bi loai" trong
	// khi moi luot deu bi loai.
	reIncompl = regexp.MustCompile(`^dlp_gateway_attach_phase_incomplete_total\{([^}]*)\}\s+([0-9.e+-]+)`)
)

func docBangChang(ctx context.Context, base string) (*bangChang, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/metrics", nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	b := &bangChang{chang: map[string]changStat{}}
	for _, line := range strings.Split(string(raw), "\n") {
		switch {
		case rePhaseLine.MatchString(line):
			m := rePhaseLine.FindStringSubmatch(line)
			kind, nhanRaw, valRaw := m[1], m[2], m[3]
			val, err := strconv.ParseFloat(valRaw, 64)
			if err != nil {
				continue
			}
			var phase, le string
			for _, n := range reNhan.FindAllStringSubmatch(nhanRaw, -1) {
				switch n[1] {
				case "phase":
					phase = n[2]
				case "le":
					le = n[2]
				}
			}
			if phase == "" {
				continue
			}
			s := b.chang[phase]
			switch kind {
			case "count":
				s.count = int64(val)
			case "sum":
				s.sum = val
			case "bucket":
				if f, err := strconv.ParseFloat(le, 64); err == nil {
					s.buckets = append(s.buckets, bucket{le: f, cum: int64(val)})
				}
			}
			b.chang[phase] = s

		case reCtlBucket.MatchString(line):
			m := reCtlBucket.FindStringSubmatch(line)
			le, err1 := strconv.ParseFloat(m[1], 64)
			cum, err2 := strconv.ParseFloat(m[2], 64)
			if err1 == nil && err2 == nil {
				b.controlled.buckets = append(b.controlled.buckets, bucket{le: le, cum: int64(cum)})
			}
		case reCtlCount.MatchString(line):
			if v, err := strconv.ParseFloat(reCtlCount.FindStringSubmatch(line)[1], 64); err == nil {
				b.controlled.count = int64(v)
			}
		case reCtlSum.MatchString(line):
			if v, err := strconv.ParseFloat(reCtlSum.FindStringSubmatch(line)[1], 64); err == nil {
				b.controlled.sum = v
			}

		case reTongSum.MatchString(line):
			if v, err := strconv.ParseFloat(reTongSum.FindStringSubmatch(line)[1], 64); err == nil {
				b.tongSum = v
			}
		case reTongCount.MatchString(line):
			if v, err := strconv.ParseFloat(reTongCount.FindStringSubmatch(line)[1], 64); err == nil {
				b.tongCount = int64(v)
			}
		case reIncompl.MatchString(line):
			m := reIncompl.FindStringSubmatch(line)
			if v, err := strconv.ParseFloat(m[2], 64); err == nil {
				b.incomplete += v
				for _, n := range reNhan.FindAllStringSubmatch(m[1], -1) {
					if n[1] == "reason" {
						if b.incompleteLyDo == nil {
							b.incompleteLyDo = map[string]float64{}
						}
						b.incompleteLyDo[n[2]] = v
					}
				}
			}
		}
	}

	if len(b.chang) == 0 {
		return nil, fmt.Errorf("không thấy dlp_gateway_attach_phase_seconds trong %s/metrics — "+
			"gateway đang chạy bản CHƯA có instrumentation của 1.G-4", base)
	}
	for p, s := range b.chang {
		sort.Slice(s.buckets, func(i, j int) bool { return s.buckets[i].le < s.buckets[j].le })
		b.chang[p] = s
	}
	sort.Slice(b.controlled.buckets, func(i, j int) bool {
		return b.controlled.buckets[i].le < b.controlled.buckets[j].le
	})
	return b, nil
}

// NguongControlled là ô AC mà 1.G-4 P4 chốt cho phần gateway kiểm soát được.
//
// Vì sao 150ms chứ không phải "số đo + biên": đo được ~81ms ở trần CPU 500m,
// nên 150ms cho gần 2× biên mà vẫn ĐỎ ĐƯỢC — nếu ai đó thêm một lượt round-trip
// đồng bộ vào đường attach thì ô này bắt. Ngưỡng 500ms cũ trên TỔNG thì không:
// `pty` một mình đã 280ms và không đổi theo gateway, nên ô cũ đỏ vì hạ tầng và
// mù với chính thứ nó cần gác. 0.15 cũng là một mốc bucket, nên p95 đọc ra
// khẳng định được thay vì bị làm tròn lên 0.2.
const NguongControlled = 0.15

// inBangPhanBo in bảng quy trách nhiệm và TỰ ĐỎ khi phép đo không tự nhất quán.
//
// Ba cổng, mỗi cổng chặn một chế độ hỏng khác nhau — và cả ba đều là loại lỗi
// làm ra một bảng số trông hoàn toàn hợp lý:
//
//  1. `incomplete` tăng ⇒ có lượt attach bị loại khỏi phân bổ. Bảng vẫn đúng
//     cho phần còn lại nhưng KHÔNG còn phủ hết mẫu, và im lặng về nó là để
//     người đọc tin vào một mẫu số sai.
//  2. `count` của mỗi chặng phải bằng nhau VÀ bằng phần tăng của tổng. Lệch ⇒
//     một hook không chạy trên một số lượt.
//  3. `Σ sum(chặng)` phải khớp `sum(tổng)` trong ±5%. Đây là đẳng thức toán
//     học chứ không phải kỳ vọng thống kê, nên lệch nghĩa là dụng cụ đo sai —
//     đọc kết quả lúc đó là đọc một thứ đang bịa.
func inBangPhanBo(truoc, sau *bangChang, soLuot int) error {
	fmt.Printf("\n=== Bảng phân bổ chặng attach (1.G-4 M1) ===\n")

	if them := sau.incomplete - truoc.incomplete; them > 0 {
		chiTiet := make([]string, 0, 2)
		for _, r := range []string{"missing_mark", "out_of_order"} {
			if d := sau.incompleteLyDo[r] - truoc.incompleteLyDo[r]; d > 0 {
				chiTiet = append(chiTiet, fmt.Sprintf("%s=%.0f", r, d))
			}
		}
		return fmt.Errorf("%.0f lượt attach bị LOẠI khỏi phân bổ (%s) — "+
			"bảng không phủ hết mẫu, không đọc được", them, strings.Join(chiTiet, " "))
	}

	tongDeltaCount := sau.tongCount - truoc.tongCount
	if tongDeltaCount < int64(soLuot) {
		return fmt.Errorf("histogram tổng chỉ tăng %d mẫu cho %d lượt attach", tongDeltaCount, soLuot)
	}

	var tongTrungBinh float64
	type dong struct {
		ten   string
		mean  float64
		p95   float64
		count int64
	}
	var dongs []dong

	for _, p := range thuTuChang {
		s, ok := sau.chang[p]
		if !ok {
			return fmt.Errorf("chặng %q vắng mặt trong /metrics", p)
		}
		t := truoc.chang[p]
		n := s.deltaCount(t)
		if n != tongDeltaCount {
			return fmt.Errorf("chặng %q tăng %d mẫu nhưng tổng tăng %d — "+
				"một hook KHÔNG chạy trên mọi lượt, bảng phân bổ không đọc được",
				p, n, tongDeltaCount)
		}
		mean := s.deltaSum(t) / float64(n)
		tongTrungBinh += mean
		dongs = append(dongs, dong{ten: p, mean: mean, p95: s.p95Delta(t), count: n})
	}

	tongMeanThat := (sau.tongSum - truoc.tongSum) / float64(tongDeltaCount)
	lech := (tongTrungBinh - tongMeanThat) / tongMeanThat
	if lech > 0.05 || lech < -0.05 {
		return fmt.Errorf("ĐỐI CHỨNG ÂM ĐỎ: Σ trung bình năm chặng = %.4fs nhưng trung bình tổng = %.4fs "+
			"(lệch %.1f%%, trần ±5%%) — dụng cụ đo sai, KHÔNG đọc kết quả",
			tongTrungBinh, tongMeanThat, lech*100)
	}

	fmt.Printf("mẫu: %d lượt · đối chứng Σchặng=%.4fs vs tổng=%.4fs (lệch %.2f%%) ✓\n\n",
		tongDeltaCount, tongTrungBinh, tongMeanThat, lech*100)
	fmt.Printf("%-12s %10s %8s %10s\n", "chặng", "trung bình", "phần", "p95")
	fmt.Printf("%-12s %10s %8s %10s\n", "------------", "----------", "--------", "----------")
	for _, d := range dongs {
		fmt.Printf("%-12s %9.4fs %7.1f%% %9.4fs\n", d.ten, d.mean, d.mean/tongTrungBinh*100, d.p95)
	}
	fmt.Printf("%-12s %9.4fs %7.1f%%\n", "TỔNG", tongTrungBinh, 100.0)

	// ---- ô AC: phần gateway kiểm soát được --------------------------------
	ctlN := sau.controlled.deltaCount(truoc.controlled)
	if ctlN != tongDeltaCount {
		return fmt.Errorf("attach_controlled tăng %d mẫu nhưng tổng tăng %d — "+
			"ô AC đang đo trên một mẫu số khác", ctlN, tongDeltaCount)
	}
	ctlP95 := sau.controlled.p95Delta(truoc.controlled)
	ctlMean := sau.controlled.deltaSum(truoc.controlled) / float64(ctlN)

	// Đối chứng: controlled phải bằng ĐÚNG tổng trừ pty. Không có phép này thì
	// một ngày ai đó gộp nhầm `pty` vào và ô AC lặng lẽ quay về đo sàn hạ tầng.
	ptyMean := 0.0
	if s, ok := sau.chang[metricsPhasePTY]; ok {
		ptyMean = s.deltaSum(truoc.chang[metricsPhasePTY]) / float64(ctlN)
	}
	if lech := ctlMean - (tongMeanThat - ptyMean); lech > 1e-4 || lech < -1e-4 {
		return fmt.Errorf("ĐỐI CHỨNG ĐỎ: controlled=%.4fs nhưng tổng−pty=%.4fs — "+
			"ô AC KHÔNG đo thứ nó tuyên bố đo", ctlMean, tongMeanThat-ptyMean)
	}

	trangThai := "ĐẠT"
	if ctlP95 > NguongControlled {
		trangThai = "ĐỎ"
	}
	fmt.Printf("\nÔ AC — phần gateway kiểm soát được (tổng − pty):\n")
	fmt.Printf("  trung bình = %.4fs · p95 = %.4fs · ngưỡng = %.3fs ⇒ %s\n",
		ctlMean, ctlP95, NguongControlled, trangThai)
	fmt.Printf("  (pty = %.4fs — sàn hạ tầng, KHÔNG nằm trong ô AC này)\n", ptyMean)
	return nil
}

// metricsPhasePTY lặp lại hằng của package metrics vì cmd này đọc /metrics qua
// HTTP chứ không import gateway — chuỗi là contract giữa hai bên.
const metricsPhasePTY = "pty"
