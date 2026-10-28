import { Button, Card, Form, Input, Typography, message } from "antd";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

const accounts = [
  ["admin@product360.dev", "平台管理员：可见全部商品与经营字段"],
  ["operator@product360.dev", "商品运营：仅可见 Momcozy 品牌"],
  ["data@product360.dev", "数据管理员：仅可见服纺类目"],
  ["employee@product360.dev", "普通员工：价格、销量、库存显示为无权限"],
];

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f5f7f6" }}>
      <Card title="商品中心" style={{ width: 420 }}>
        <Form
          layout="vertical"
          onFinish={async (values: { email: string; password: string }) => {
            try {
              await login(values.email, values.password);
              navigate("/products");
            } catch {
              message.error("邮箱或密码不正确");
            }
          }}
        >
          <Form.Item label="邮箱" name="email" rules={[{ required: true, type: "email" }]}>
            <Input />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            登录
          </Button>
        </Form>
        <Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
          本地种子账号密码都是 product360
        </Typography.Paragraph>
        {accounts.map(([email, desc]) => (
          <Typography.Paragraph key={email} type="secondary" style={{ marginBottom: 0 }}>
            {email}：{desc}
          </Typography.Paragraph>
        ))}
      </Card>
    </div>
  );
}
