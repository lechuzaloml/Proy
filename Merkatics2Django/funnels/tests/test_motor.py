import copy
import json
from pathlib import Path

from django.test import SimpleTestCase

from funnels.motor import (
    ErrorRespuestas,
    calcular_perfil_secciones,
    calcular_resultado,
    validar_cuestionario,
    validar_respuestas,
)


ROOT = Path(__file__).resolve().parents[3]


def load_json(path):
    with path.open(encoding="utf-8") as source:
        return json.load(source)


class QuestionnaireValidationTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.case = load_json(ROOT / "spec" / "Ejemplos" / "caso-nuevo.json")

    def test_accepts_root_object_and_omitted_sections(self):
        case = copy.deepcopy(self.case)
        case.pop("secciones")
        self.assertEqual(validar_cuestionario(case), [])

    def test_rejects_wrapper_and_scoring_on_non_scored_questionnaire(self):
        self.assertIn(
            "cuestionario.id debe ser un texto no vacío.",
            validar_cuestionario({"cuestionario": self.case}),
        )
        case = copy.deepcopy(self.case)
        case["usa_scoring"] = False
        case["preguntas"][3]["participa_scoring"] = True
        self.assertTrue(
            any(
                "participa en scoring" in error
                for error in validar_cuestionario(case)
            )
        )

    def test_rejects_invalid_cta_and_unknown_question_type(self):
        case = copy.deepcopy(self.case)
        case["resultado"]["resultados"][0]["cta"].pop("accion")
        errors = validar_cuestionario(case)
        self.assertTrue(any("cta.accion" in error for error in errors))
        case = copy.deepcopy(self.case)
        case["preguntas"][0]["tipo"] = "multiple_opcion"
        self.assertTrue(
            any("preguntas[0].tipo" in error for error in validar_cuestionario(case))
        )

    def test_accepts_the_existing_single_question_type_templates(self):
        for path, expected_type in (
            (
                ROOT / "templates" / "forms" / "onboarding-para-agencia.json",
                "abierta",
            ),
            (
                ROOT / "templates" / "quizzes" / "test-madurez-marketing-digital.json",
                "opcion_multiple",
            ),
            (
                ROOT / "templates" / "assessments" / "diagnostico-preparacion-comercial.json",
                "opcion_multiple",
            ),
        ):
            with self.subTest(template=path.name):
                questionnaire = load_json(path)
                self.assertEqual(validar_cuestionario(questionnaire), [])
                self.assertEqual(
                    {question["tipo"] for question in questionnaire["preguntas"]},
                    {expected_type},
                )

    def test_validates_the_marketing_template_yes_no_options(self):
        questionnaire = load_json(
            ROOT / "templates" / "quizzes" / "test-madurez-marketing-digital.json"
        )

        self.assertEqual(validar_cuestionario(questionnaire), [])
        for question in questionnaire["preguntas"]:
            self.assertEqual(
                [option["texto"] for option in question["opciones"]],
                ["Sí", "No"],
            )

    def test_validates_existing_contract_edge_cases(self):
        cases = []

        data = copy.deepcopy(self.case)
        data["estilo_visual"] = "estilo-inexistente"
        cases.append((data, "estilo_visual no corresponde"))

        data = copy.deepcopy(self.case)
        data["usa_scoring"] = "no"
        cases.append((data, "usa_scoring debe ser exactamente true o false"))

        data = copy.deepcopy(self.case)
        data["reglas_scoring"] = []
        cases.append((data, "necesita reglas de scoring"))

        data = copy.deepcopy(self.case)
        data["resultado"] = {"tipo": "fijo", "contenido": "Resultado"}
        cases.append((data, "requiere resultado.tipo"))

        data = copy.deepcopy(self.case)
        data["posicion_contacto"] = "medio"
        cases.append((data, 'posicion_contacto debe ser "inicio" o "final"'))

        data = copy.deepcopy(self.case)
        data["personalizar_resultado_con_ia"] = "sí"
        cases.append((data, "personalizar_resultado_con_ia debe ser booleano"))

        data = copy.deepcopy(self.case)
        del data["preguntas"][0]["opciones"]
        cases.append((data, "opción múltiple no tiene una estructura válida"))

        data = copy.deepcopy(self.case)
        data["preguntas"][0]["opciones"] = []
        cases.append((data, "opción múltiple no tiene una estructura válida"))

        data = copy.deepcopy(self.case)
        del data["preguntas"][0]["id"]
        cases.append((data, "preguntas[0].id debe ser un texto no vacío"))

        data = copy.deepcopy(self.case)
        data["preguntas"][0]["opciones"][0]["puntos"] = "10"
        cases.append((data, "opciones[0].puntos debe ser numérico"))

        data = copy.deepcopy(self.case)
        data["preguntas"][2]["escala"] = {"min": 1}
        cases.append((data, "preguntas[2].escala.max debe ser numérico"))

        data = copy.deepcopy(self.case)
        data["preguntas"][2]["puntos_por_valor"] = [0, 5, 10]
        cases.append((data, "puntos_por_valor debe ser un objeto"))

        data = copy.deepcopy(self.case)
        data["reglas_scoring"][0]["puntaje_min"] = "cero"
        cases.append((data, "reglas_scoring[0].puntaje_min debe ser numérico"))

        data = copy.deepcopy(self.case)
        data["reglas_scoring"][0]["segmento"] = "sin-resultado"
        cases.append(
            (
                data,
                "reglas_scoring[0].segmento no tiene un resultado correspondiente",
            )
        )

        data = copy.deepcopy(self.case)
        data["resultado"]["resultados"][0]["cta"] = {"texto": "Ver recursos"}
        cases.append(
            (
                data,
                "resultado.resultados[0].cta.accion debe ser un texto no vacío",
            )
        )

        for questionnaire, expected_error in cases:
            with self.subTest(error=expected_error):
                self.assertTrue(
                    any(
                        expected_error in error
                        for error in validar_cuestionario(questionnaire)
                    )
                )
        self.assertTrue(validar_cuestionario(None))


class QuestionnaireScoringTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        raw = load_json(ROOT / "spec" / "Ejemplos" / "caso-nuevo.json")
        errors = validar_cuestionario(raw)
        if errors:
            raise AssertionError("\n".join(errors))
        cls.questionnaire = raw

    def answers(self, option_a, option_b, scale, option_c, open_value=""):
        return {
            "0": {"tipo": "opcion_multiple", "indiceOpcion": option_a},
            "1": {"tipo": "opcion_multiple", "indiceOpcion": option_b},
            "2": {"tipo": "escala", "valor": scale},
            "3": {"tipo": "abierta", "valor": open_value or "respuesta"},
            "4": {"tipo": "opcion_multiple", "indiceOpcion": option_c},
        }

    def calculate(self, answers):
        readable = validar_respuestas(self.questionnaire, answers)
        return calcular_resultado(self.questionnaire, readable), readable

    def test_calculates_cold_warm_and_ready_segments_on_server(self):
        cold, _ = self.calculate(self.answers(0, 0, 1, 2))
        warm, _ = self.calculate(self.answers(1, 1, 3, 2))
        ready, _ = self.calculate(self.answers(2, 2, 5, 0))
        self.assertEqual((cold["segmento"], cold["puntaje_total"]), ("frio", 0))
        self.assertEqual((warm["segmento"], warm["puntaje_total"]), ("tibio", 25))
        self.assertEqual((ready["segmento"], ready["puntaje_total"]), ("listo", 80))

    def test_calculates_cold_result_with_no_answers(self):
        result = calcular_resultado(self.questionnaire, {})

        self.assertEqual(result["segmento"], "frio")
        self.assertEqual(result["puntaje_total"], 0)

    def test_open_response_does_not_score_and_response_is_readable(self):
        result, readable = self.calculate(
            self.answers(0, 0, 1, 2, open_value="Texto libre")
        )
        self.assertEqual(result["puntaje_total"], 0)
        self.assertEqual(readable["3"]["valor_legible"], "Texto libre")
        self.assertEqual(readable["0"]["valor_legible"], "Menos de $20,000 MXN")

    def test_rejects_missing_out_of_range_and_unknown_answers(self):
        with self.assertRaises(ErrorRespuestas):
            validar_respuestas(self.questionnaire, {})
        answers = self.answers(0, 0, 1, 2)
        answers["2"]["valor"] = 6
        with self.assertRaises(ErrorRespuestas):
            validar_respuestas(self.questionnaire, answers)
        answers = self.answers(0, 0, 1, 2)
        answers["99"] = {"tipo": "abierta", "valor": "extra"}
        with self.assertRaises(ErrorRespuestas):
            validar_respuestas(self.questionnaire, answers)

    def test_returns_explicit_error_when_no_scoring_rule_matches(self):
        case = copy.deepcopy(self.questionnaire)
        case["reglas_scoring"][-1]["puntaje_max"] = 79
        answers = validar_respuestas(case, self.answers(2, 2, 5, 0))
        with self.assertRaisesMessage(
            ErrorRespuestas, "No se encontró un segmento"
        ):
            calcular_resultado(case, answers)

    def test_calculates_section_profile_and_omits_non_scoring_questions(self):
        questionnaire = copy.deepcopy(self.questionnaire)
        questionnaire["preguntas"][3]["seccion"] = "Respuesta abierta"
        answers = validar_respuestas(questionnaire, self.answers(2, 2, 5, 0))
        result = calcular_resultado(questionnaire, answers)
        profile = calcular_perfil_secciones(questionnaire, answers)
        self.assertEqual(result["puntaje_maximo"], 80)
        self.assertTrue(profile)
        self.assertTrue(all(item["modo"] == "puntaje" for item in profile))
        self.assertNotIn(
            "Respuesta abierta",
            [item["nombre"] for item in profile],
        )

    def test_fixed_result_does_not_create_a_score_or_segment(self):
        questionnaire = {
            "usa_scoring": False,
            "preguntas": [],
            "resultado": {"tipo": "fijo", "contenido": "Gracias."},
        }
        result = calcular_resultado(questionnaire, {})
        self.assertEqual(result["resultado"]["contenido"], "Gracias.")
        self.assertEqual(result["puntaje_total"], 0)
        self.assertEqual(result["segmento"], "")

    def test_missing_scale_points_and_option_points_score_zero(self):
        questionnaire = copy.deepcopy(self.questionnaire)
        del questionnaire["preguntas"][0]["opciones"][0]["puntos"]
        questionnaire["preguntas"][2]["puntos_por_valor"].pop("3", None)
        errors = validar_cuestionario(questionnaire)
        self.assertEqual(errors, [])
        result = calcular_resultado(
            questionnaire,
            {
                "0": {"tipo": "opcion_multiple", "valor": 0},
                "2": {"tipo": "escala", "valor": 3},
            },
        )
        self.assertEqual(result["puntaje_total"], 0)
        self.assertEqual(result["segmento"], "frio")


class QuestionnaireProfileTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.templates = [
            "assessments/evaluacion-ciberseguridad.json",
            "assessments/evaluacion-liderazgo.json",
            "assessments/diagnostico-madurez-tecnologica.json",
            "assessments/diagnostico-preparacion-comercial.json",
            "quizzes/test-madurez-marketing-digital.json",
            "forms/onboarding-para-agencia.json",
            "events/registro-a-masterclass.json",
            "surveys/diagnostico-salud-financiera.json",
        ]

    def test_all_library_templates_produce_the_expected_profile_modes(self):
        for relative_path in self.templates:
            questionnaire = load_json(ROOT / "templates" / relative_path)
            self.assertEqual(validar_cuestionario(questionnaire), [])
            profile = calcular_perfil_secciones(questionnaire, {})
            self.assertGreaterEqual(len(profile), 2)
            expected_mode = "puntaje" if questionnaire["usa_scoring"] else "avance"
            self.assertTrue(
                all(item["modo"] == expected_mode for item in profile),
                relative_path,
            )

    def test_unscored_responses_show_progress_by_section(self):
        questionnaire = load_json(
            ROOT / "templates" / "forms" / "onboarding-para-agencia.json"
        )
        answers = {
            "0": {"tipo": "abierta", "valor": "Descripción"},
            "2": {"tipo": "abierta", "valor": "Más ventas"},
            "3": {"tipo": "abierta", "valor": "Campañas digitales"},
        }

        profile = calcular_perfil_secciones(questionnaire, answers)

        self.assertEqual(
            profile,
            [
                {
                    "nombre": "Tu organización",
                    "modo": "avance",
                    "porcentaje": 50,
                    "respondidas": 1,
                    "total_preguntas": 2,
                },
                {
                    "nombre": "Proyecto y objetivos",
                    "modo": "avance",
                    "porcentaje": 100,
                    "respondidas": 2,
                    "total_preguntas": 2,
                },
                {
                    "nombre": "Marca y coordinación",
                    "modo": "avance",
                    "porcentaje": 0,
                    "respondidas": 0,
                    "total_preguntas": 3,
                },
            ],
        )

    def test_scored_percentages_ignore_unscored_questions_and_count_pending(self):
        questionnaire = load_json(
            ROOT / "templates" / "assessments" / "evaluacion-liderazgo.json"
        )
        questionnaire["preguntas"].append(
            {
                "id": "p7",
                "seccion": "Comunicación y dirección",
                "texto": "Pregunta abierta sin scoring para la prueba",
                "tipo": "abierta",
                "participa_scoring": False,
            }
        )
        answers = {
            "0": {"tipo": "escala", "valor": 5},
            "1": {"tipo": "escala", "valor": 4},
            "2": {"tipo": "escala", "valor": 3},
            "3": {"tipo": "escala", "valor": 1},
            "6": {"tipo": "abierta", "valor": "Respuesta libre"},
        }

        profile = calcular_perfil_secciones(questionnaire, answers)

        self.assertEqual(
            profile,
            [
                {
                    "nombre": "Comunicación y dirección",
                    "modo": "puntaje",
                    "porcentaje": 86,
                    "respondidas": 2,
                    "total_preguntas": 2,
                },
                {
                    "nombre": "Desarrollo del equipo",
                    "modo": "puntaje",
                    "porcentaje": 24,
                    "respondidas": 2,
                    "total_preguntas": 2,
                },
                {
                    "nombre": "Reflexión personal",
                    "modo": "puntaje",
                    "porcentaje": 0,
                    "respondidas": 0,
                    "total_preguntas": 2,
                },
            ],
        )
        partial = calcular_perfil_secciones(
            questionnaire,
            {"0": {"tipo": "escala", "valor": 5}},
        )
        self.assertEqual(
            (partial[0]["porcentaje"], partial[0]["respondidas"]),
            (50, 1),
        )

    def test_unscored_profile_for_all_templates_counts_completed_answers(self):
        for relative_path in (
            "forms/onboarding-para-agencia.json",
            "surveys/diagnostico-salud-financiera.json",
            "events/registro-a-masterclass.json",
        ):
            questionnaire = load_json(ROOT / "templates" / relative_path)
            answers = {}
            for index, question in enumerate(questionnaire["preguntas"]):
                if question["tipo"] == "opcion_multiple":
                    answer = {"tipo": "opcion_multiple", "indiceOpcion": 0}
                elif question["tipo"] == "escala":
                    answer = {
                        "tipo": "escala",
                        "valor": question["escala"]["min"],
                    }
                else:
                    answer = {"tipo": "abierta", "valor": "Respuesta de prueba"}
                answers[str(index)] = answer

            with self.subTest(template=relative_path):
                profile = calcular_perfil_secciones(questionnaire, answers)
                self.assertGreaterEqual(len(profile), 2)
                self.assertTrue(
                    all(
                        dimension["modo"] == "avance"
                        and dimension["porcentaje"] == 100
                        for dimension in profile
                    )
                )
