// 서비스 이용약관 모달
export function TermsModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 640, maxHeight: '85vh',
          background: 'var(--bg-panel)', border: '1px solid var(--accent)',
          borderRadius: 6, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(201,162,77,0.08)',
        }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>
            서비스 이용약관
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-dim)', padding: '4px 12px', cursor: 'pointer',
              borderRadius: 3, fontSize: 12,
            }}
          >닫기</button>
        </div>

        <div style={{
          flex: 1, overflowY: 'auto', padding: '18px 22px',
          fontSize: 12, lineHeight: 1.7, color: 'var(--text)',
        }}>
          <p style={{ color: 'var(--text-dim)', marginBottom: 14 }}>
            본 약관은 마지막이야기 (이하 "서비스")의 이용 조건 및 절차, 운영자와 이용자 간의 권리·의무 등을 규정합니다.
            회원 가입 시 본 약관에 동의한 것으로 간주합니다.
          </p>

          <Article title="제1조 (목적)">
            이 약관은 마지막이야기가 제공하는 웹 게임 서비스(이하 "서비스")의 이용 조건과 절차, 운영자와 이용자 사이의 권리·의무 및 책임 사항을 규정함을 목적으로 합니다.
          </Article>

          <Article title="제2조 (정의)">
            ① "서비스"란 운영자가 제공하는 웹 기반 게임 및 관련 부가 기능 일체를 말합니다.<br/>
            ② "이용자"란 본 약관에 동의하고 서비스를 이용하는 모든 회원을 말합니다.<br/>
            ③ "계정"이란 이용자가 구글 계정으로 로그인하여 서비스 이용을 위해 할당받는 식별 정보를 말합니다.
          </Article>

          <Article title="제3조 (약관의 효력 및 변경)">
            ① 본 약관은 서비스 내 공지함으로써 효력이 발생합니다.<br/>
            ② 운영자는 합리적 사유가 있는 경우 약관을 변경할 수 있으며, 변경 시 서비스 공지사항을 통해 사전 고지합니다.<br/>
            ③ 변경된 약관에 동의하지 않는 경우 서비스 이용을 중단하고 탈퇴할 수 있습니다.
          </Article>

          <Article title="제4조 (회원 가입)">
            ① 서비스는 <b>구글(Google) 계정 로그인만 지원</b>합니다. 아이디/비밀번호를 이용한 별도 회원가입은 제공하지 않습니다.<br/>
            ② 최초 구글 로그인 시 자동으로 계정이 생성되며, 본 약관에 동의한 것으로 간주됩니다.<br/>
            ③ 아래 경우 가입이 제한되거나 계정이 삭제될 수 있습니다.
            <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
              <li>타인의 구글 계정을 도용하거나 허위 정보로 가입한 경우</li>
              <li>이전에 서비스 이용 정지 또는 강제 탈퇴 처리된 경우</li>
              <li>기타 운영자가 필요하다고 판단한 경우</li>
            </ul>
          </Article>

          <Article title="제5조 (서비스 이용)">
            ① 서비스는 연중무휴·24시간 제공을 원칙으로 합니다. 단, 시스템 점검·장애·서버 비용 등의 사유로 일시 중단될 수 있습니다.<br/>
            ② 운영자는 서비스 중단 시 사전 또는 사후에 공지합니다.<br/>
            ③ 서비스는 현재 <b>완전 무료</b>로 제공되며, 유료 결제 요소는 존재하지 않습니다.
          </Article>

          <Article title="제6조 (이용자의 의무)">
            이용자는 아래 행위를 하여서는 안 됩니다.<br/>
            ① 타인의 구글 계정을 도용하거나 무단으로 접속하는 행위<br/>
            ② 서비스의 정상적인 운영을 방해하는 행위 (해킹, 스크래핑, 매크로, 어뷰징 등)<br/>
            ③ 다계정을 이용한 자원 이동·부당 거래·시장 조작 행위<br/>
            ④ 다른 이용자에게 불쾌감을 주는 언어 또는 행동<br/>
            ⑤ 기타 관계 법령 및 본 약관에 위반되는 행위
          </Article>

          <Article title="제7조 (계정 관리)">
            ① 계정은 구글 계정으로 관리되므로, 구글 계정의 보안은 이용자 본인이 책임집니다.<br/>
            ② 계정 도용 등 보안 사고 발생 시 즉시 운영자에게 통보해야 합니다.<br/>
            ③ 통보 지연으로 인한 불이익에 대해 운영자는 책임지지 않습니다.
          </Article>

          <Article title="제8조 (서비스 이용 제한)">
            운영자는 이용자가 제6조를 위반한 경우 경고, 거래 제한, 일시 정지, 영구 정지, IP 차단 등의 조치를 취할 수 있습니다.
          </Article>

          <Article title="제9조 (무료 서비스 안내)" highlight>
            <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>※ 유료 결제 요소 없음</div>
            ① 본 서비스는 어떠한 형태의 <b>유료 결제·캐시·과금 요소도 존재하지 않습니다</b>.<br/>
            ② 추후 유료 요소가 도입될 경우 사전 공지를 통해 이용자의 동의를 받아 별도 약관을 적용합니다.<br/>
            ③ 현재 서비스 운영 비용은 전적으로 운영자가 부담합니다.
          </Article>

          <Article title="제10조 (게임물 등급 분류 안내)" highlight>
            <div style={{ fontWeight: 700, color: '#ff9966', marginBottom: 4 }}>※ 게임물관리위원회 등급 분류 미통과 안내</div>
            ① 본 서비스는 현재 게임물관리위원회의 <b>등급 분류를 받지 않은 상태</b>입니다.<br/>
            ② 운영자는 향후 정식 서비스 전환 시 등급 분류를 받을 예정입니다.<br/>
            ③ 본 서비스는 현재 <b>테스트/개발 단계</b>로 제공되며, 정식 운영 이전에는 사전 고지 없이 데이터 초기화, 기능 변경, 서비스 중단 등이 발생할 수 있습니다.<br/>
            ④ 이용자는 본 서비스가 테스트 단계임을 인지하고 이용하는 것에 동의합니다.
          </Article>

          <Article title="제11조 (운영자의 면책)">
            ① 운영자는 천재지변, 서버 장애, 네트워크 문제 등 불가항력으로 인한 서비스 중단에 대해 책임을 지지 않습니다.<br/>
            ② 이용자의 귀책 사유로 발생한 손해에 대해 운영자는 책임을 지지 않습니다.<br/>
            ③ 서비스는 무료로 제공되며, 운영자는 서비스 이용으로 인한 기대 이익 손실에 대해 책임을 지지 않습니다.<br/>
            ④ 운영자는 서비스 종료, 데이터 초기화, 데이터 소실에 대해 사전 고지 이외의 보상 의무를 지지 않습니다.
          </Article>

          <Article title="제12조 (서비스 종료 및 데이터 초기화)">
            ① 운영자는 서비스를 종료할 경우 7일 전 공지사항을 통해 고지합니다.<br/>
            ② 테스트 단계에서는 밸런스 조정 또는 버그 대응을 위해 사전 공지 후 <b>데이터 초기화</b>가 발생할 수 있습니다.<br/>
            ③ 서비스 종료 또는 초기화에 따른 게임 내 자산(캐릭터·아이템·골드 등)은 어떠한 형태로도 보상되지 않습니다.
          </Article>

          <Article title="제13조 (개인정보 처리)">
            ① 본 서비스는 구글 OAuth 로그인 시 제공되는 최소한의 정보(구글 계정 고유 ID, 이메일, 이름)만을 이용자 식별 및 서비스 제공 목적으로 이용합니다.<br/>
            ② 이용자의 접속 IP, 활동 로그는 악성 행위 탐지 및 서비스 개선 목적으로만 사용됩니다.<br/>
            ③ 이용자의 개인정보는 제3자에게 제공되지 않으며, 서비스 종료 또는 회원 탈퇴 시 법령에서 정한 기간 후 파기됩니다.
          </Article>

          <Article title="제14조 (분쟁 해결 및 준거법)">
            ① 서비스 이용과 관련하여 분쟁이 발생한 경우 운영자와 이용자는 상호 협의를 통해 해결합니다.<br/>
            ② 협의가 이루어지지 않는 경우 대한민국 법령에 따라 처리합니다.<br/>
            ③ 본 약관에 관한 소송의 관할 법원은 민사소송법에 따릅니다.
          </Article>

          <div style={{
            marginTop: 18, paddingTop: 12, borderTop: '1px solid var(--border)',
            fontSize: 11, color: 'var(--text-dim)', textAlign: 'right',
          }}>
            시행일: 2026년 04월 19일<br/>
            최종 수정일: 2026년 04월 19일
          </div>
        </div>
      </div>
    </div>
  );
}

function Article({ title, children, highlight }: { title: string; children: React.ReactNode; highlight?: boolean }) {
  return (
    <div style={{
      marginBottom: 14,
      padding: highlight ? '10px 12px' : 0,
      background: highlight ? 'rgba(201,162,77,0.06)' : 'transparent',
      borderLeft: highlight ? '3px solid var(--accent)' : 'none',
      borderRadius: highlight ? 3 : 0,
    }}>
      <div style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 13, marginBottom: 4 }}>{title}</div>
      <div style={{ color: 'var(--text-dim)' }}>{children}</div>
    </div>
  );
}
