import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {z} from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod" //giúp kết nối zod với react-hook-form để validate dữ liệu nhập vào
import { Label } from "../ui/label"
import { useAuthStore } from "@/stores/useAuthStore"
import { useNavigate } from "react-router"



// thư viện zod quản lí dữ liệu nhập vào, có thể dùng để validate dữ liệu trước khi gửi lên server
const signupSchema = z.object({
  firstName: z.string().min(1, "Họ không được để trống"),
  lastName: z.string().min(1, "Tên không được để trống"),
  username: z.string().min(3, "Tên đăng nhập phải có ít nhất 3 ký tự"),
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(6, "Mật khẩu phải có ít nhất 6 ký tự"),
  role: z.enum(["student", "admin"], "Vui lòng chọn một chức vụ"),
});
type SignupFormValues = z.infer<typeof signupSchema>;
export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { signUp } = useAuthStore();
  const navigate = useNavigate();
// hàm xử lí khi submit form, sẽ được gọi khi người dùng nhấn nút đăng kí
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<SignupFormValues>({
  resolver: zodResolver(signupSchema)
  })

  const onsubmit = async (data: SignupFormValues) => {
    const { firstName, lastName, username, email, password, role } = data;
        // gọi api backend
    await signUp(username, email, password, firstName, lastName, role);

    navigate("/signin"); //chuyển hướng đến trang đăng nhập sau khi đăng ký thành công
  }


  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form className="p-6 md:p-8" onSubmit={handleSubmit(onsubmit)}> 
            <div className="flex flex-col gap-6">
            {/* header  logo */}
              <div className="flex flex-col items-center text-center gap-2">
                <a href="/"
                className="mx-auto block w-fit text-center"
                >
                  <img src="logo.svg" alt="Logo" />
                </a>
                <h1 className="text-2xl font-bold">Tạo tài khoản exam</h1>
                <p className="text-muted-foreground  text-balance">
                  chào mừng bạn đến với exam, hãy tạo tài khoản để trải nghiệm dịch vụ của chúng tôi  
                </p>
              </div>
            {/* họ và tên */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="first-name">Họ</Label>
                  <Input type="text" id="first-name" placeholder="Họ" {...register("firstName")} />
                  {/* todo error */}
                  {errors.firstName && <p className="text-sm text-destructive">{errors.firstName.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last-name">Tên</Label>
                  <Input type="text" id="last-name" placeholder="Tên"  {...register("lastName")}/>
                    {/* todo error */}
                    {errors.lastName && <p className="text-sm text-destructive">{errors.lastName.message}</p>}
                </div>
              </div>
            {/* user name */}
              <div className="flex flex-col gap-3">
                  <Label htmlFor="username">Tên đăng nhập</Label>
                  <Input type="text" id="username" placeholder="Tên đăng nhập" {...register("username")}/>
                    {/* todo error */}
                    {errors.username && <p className="text-sm text-destructive">{errors.username.message}</p>}
              </div>
            {/* email */}
              <div className="flex flex-col gap-3">
                  <Label htmlFor="email">Email</Label>
                  <Input type="email" id="email" placeholder="Abc@gmail.com" {...register("email")} />
                    {/* todo error */}
                    {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
              </div>
            {/* password */}
              <div className="flex flex-col gap-3">
                  <Label htmlFor="password">Mật khẩu</Label>
                  <Input type="password" id="password" placeholder="Mật khẩu" {...register("password")} />
                    {/* todo error */}
                    {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
                </div>
            {/* đăng kí với chức vụ gì */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'student', label: 'Học sinh' },
                  { value: 'admin',   label: 'Giáo viên' },
                ].map((item) => (
                  <label
                    key={item.value}
                    className={`flex items-center gap-3 border rounded-lg px-4 py-3 cursor-pointer transition-colors ${
                      watch('role') === item.value
                        ? 'border-violet-500 bg-violet-500/5'
                        : 'border-input hover:border-violet-500/50'
                    }`}
                  >
                    <input
                      type="radio"
                      value={item.value}
                      className="hidden"
                      {...register('role')}
                    />
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      watch('role') === item.value
                        ? 'border-violet-500'
                        : 'border-muted-foreground'
                    }`}>
                      {watch('role') === item.value && (
                        <div className="w-2 h-2 rounded-full bg-violet-500" />
                      )}
                    </div>
                    <p className="text-sm font-medium">{item.label}</p>
                  </label>
                ))}
                {errors.role && <p className="text-sm text-destructive">{errors.role.message}</p>}
              </div>
                
            {/* button đăng kí */}
              <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting}
              >
                Tạo tài khoản
              </Button>
              <div className="text-center text-sm">
                Đã có tài khoản?{" "}
                <a href="/signin" className="underline underline-offset-4">Đăng nhập</a>
              </div>
            </div>
          </form>
          <div className="relative hidden bg-muted md:block">
            <img
              src="/placeholderSignUp.png"
              alt="Image"
              className="absolute top-1/2 -translate-y-1/2 object-cover "
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
