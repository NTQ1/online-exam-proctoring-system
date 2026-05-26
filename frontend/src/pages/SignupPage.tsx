import { SignupForm } from '@/components/auth/signup-form'

const SignupPage = () => {
  return (
    <div className="min-h-screen w-full relative">
      {/* Background */}
      <div
        className="absolute inset-0 z-0"
        style={{
          background: "radial-gradient(125% 125% at 50% 10%, #fff 40%, #7c3aed 100%)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-4xl">
          <SignupForm />
        </div>
      </div>
    </div>
  )
}

export default SignupPage