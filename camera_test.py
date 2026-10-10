"""Manual camera preview utility; safe to import during pytest discovery."""


def main() -> None:
    """Open a camera preview when this file is run directly."""
    try:
        import cv2
    except ImportError:
        print("Camera test unavailable: OpenCV (cv2) is not installed.")
        return

    camera = None
    try:
        camera = cv2.VideoCapture(0)
        if not camera.isOpened():
            print("Camera test unavailable: could not access camera 0. Check camera permissions.")
            return

        print("Camera opened. Press Q to quit.")
        while True:
            success, frame = camera.read()
            if not success:
                print("Camera test stopped: could not read a camera frame.")
                break

            cv2.imshow("Argus - Camera Test", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    except Exception as exc:
        print(f"Camera test unavailable: {exc}")
    finally:
        if camera is not None:
            camera.release()
        try:
            cv2.destroyAllWindows()
        except Exception:
            pass


if __name__ == "__main__":
    main()
